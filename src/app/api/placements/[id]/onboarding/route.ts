import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Placement from "@/models/Placement";
import { Employer } from "@/models/Employer";
import OnboardingChecklist from "@/models/OnboardingChecklist";
import { validateBody } from "@/lib/validators";
import { onboardingCreateSchema, onboardingUpdateSchema } from "@/lib/validators/onboarding";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { notify } from "@/lib/notifications/trigger";
import { withSignedDocUrls } from "@/lib/onboarding/documentAccess";
import type { UserRole } from "@/models/User";
import type { IOnboardingTask } from "@/models/OnboardingChecklist";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** Default starter tasks seeded the first time an onboarding is created. */
const DEFAULT_TASKS = [
  { title: "Send welcome email & first-day details", completed: false },
  { title: "Prepare employment contract & paperwork", completed: false },
  { title: "Collect identification & right-to-work documents", completed: false },
  { title: "Set up workstation, accounts & access", completed: false },
  { title: "Schedule first-week orientation", completed: false },
  { title: "Assign onboarding buddy / manager", completed: false },
];

interface ChecklistLike {
  documents?: { url?: string | null }[];
  toObject?: () => ChecklistLike;
}

/**
 * The checklist as the employer's page gets it: uploaded files are private
 * objects, so each address is swapped for a signed one. Runs on a plain copy,
 * after any save, so a signed address is never written back to the database.
 */
async function forEmployer(checklist: unknown) {
  const source = checklist as ChecklistLike;
  const plain = typeof source.toObject === "function" ? source.toObject() : source;
  return { ...plain, documents: await withSignedDocUrls(plain.documents ?? []) };
}

/** Resolve the placement and verify the caller (admin or owning employer) may access it. */
async function resolvePlacement(ctx: AuthCtx, placementId?: string) {
  if (!isValidObjectId(placementId)) {
    return { error: NextResponse.json({ error: "Invalid ID" }, { status: 400 }) };
  }
  const placement = await Placement.findById(placementId)
    .populate({ path: "jobSeekerId", populate: { path: "userId", select: "name" } })
    .populate("jobId", "title")
    .lean();
  if (!placement) {
    return { error: NextResponse.json({ error: "Placement not found" }, { status: 404 }) };
  }
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String((placement as { employerId: unknown }).employerId) !== String((emp as { _id: unknown })._id)) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
  } else if (ctx.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { placement };
}

/**
 * GET /api/placements/[id]/onboarding (FG-1)
 * Returns the placement's onboarding checklist, creating an empty one (without
 * seeded tasks) on first read so the UI always has a record to render.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const { error, placement } = await resolvePlacement(ctx, params?.id);
  if (error) return error;

  let checklist = await OnboardingChecklist.findOne({ placementId: params?.id }).lean();
  if (!checklist) {
    const created = await OnboardingChecklist.create({
      placementId: (placement as { _id: unknown })._id,
      employerId: (placement as { employerId: unknown }).employerId,
      jobSeekerId: (placement as { jobSeekerId: { _id: unknown } }).jobSeekerId._id,
      startDate: (placement as { startDate?: Date }).startDate,
      tasks: [],
      createdBy: ctx.userId,
    });
    checklist = created.toObject();
  }

  return NextResponse.json({ onboarding: await forEmployer(checklist), placement });
}

/**
 * POST /api/placements/[id]/onboarding (FG-1)
 * Initialise the checklist with the default task template (or a provided set).
 */
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const { error, placement } = await resolvePlacement(ctx, params?.id);
  if (error) return error;

  const body = await validateBody(req, onboardingCreateSchema);

  const tasks = (body.tasks && body.tasks.length > 0
    ? body.tasks.map((task) => ({
        title: task.title,
        description: task.description,
        assignee: task.assignee,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        completed: false,
      }))
    : DEFAULT_TASKS);

  const checklist = await OnboardingChecklist.findOneAndUpdate(
    { placementId: params?.id },
    {
      $setOnInsert: {
        placementId: (placement as { _id: unknown })._id,
        employerId: (placement as { employerId: unknown }).employerId,
        jobSeekerId: (placement as { jobSeekerId: { _id: unknown } }).jobSeekerId._id,
        createdBy: ctx.userId,
      },
      $set: {
        tasks,
        status: "in_progress",
        startDate: body.startDate ? new Date(body.startDate) : (placement as { startDate?: Date }).startDate,
        notes: body.notes,
      },
    },
    { returnDocument: "after", upsert: true }
  ).lean();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "onboarding.create",
    resource: "placements",
    resourceId: String(params?.id),
    req,
  }).catch(() => { /* non-blocking */ });

  return NextResponse.json({ onboarding: await forEmployer(checklist) }, { status: 201 });
}

/**
 * PATCH /api/placements/[id]/onboarding (FG-1)
 * Mutate the checklist: status/notes, add/toggle/edit/remove a task, or add/remove
 * a document. The overall status auto-derives to completed when every task is done.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const { error, placement } = await resolvePlacement(ctx, params?.id);
  if (error) return error;

  const checklist = await OnboardingChecklist.findOne({ placementId: params?.id });
  if (!checklist) return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });

  const body = await validateBody(req, onboardingUpdateSchema);

  if (body.notes !== undefined) checklist.notes = body.notes;
  if (body.startDate) checklist.startDate = new Date(body.startDate);

  // Probation period (employer-managed).
  if (body.probation) {
    checklist.probation = {
      endDate: body.probation.endDate ? new Date(body.probation.endDate) : undefined,
      status: body.probation.status,
      notes: body.probation.notes,
    };
    checklist.markModified("probation");
  }

  if (body.addTask) {
    checklist.tasks.push({
      title: body.addTask.title,
      description: body.addTask.description,
      assignee: body.addTask.assignee,
      assigneeUserId: body.addTask.assigneeUserId
        ? new mongoose.Types.ObjectId(body.addTask.assigneeUserId)
        : undefined,
      dueDate: body.addTask.dueDate ? new Date(body.addTask.dueDate) : undefined,
      completed: false,
    });
  }

  if (body.task) {
    const task = checklist.tasks[body.task.index];
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (body.task.remove) {
      checklist.tasks.splice(body.task.index, 1);
    } else {
      if (body.task.completed !== undefined) {
        task.completed = body.task.completed;
        task.completedAt = body.task.completed ? new Date() : undefined;
      }
      if (body.task.title) task.title = body.task.title;
      if (body.task.assignee !== undefined) task.assignee = body.task.assignee;
      if (body.task.assigneeUserId !== undefined) {
        task.assigneeUserId = body.task.assigneeUserId
          ? new mongoose.Types.ObjectId(body.task.assigneeUserId)
          : undefined;
      }
      if (body.task.dueDate !== undefined) task.dueDate = body.task.dueDate ? new Date(body.task.dueDate) : undefined;
    }
    checklist.markModified("tasks");
  }

  // Add a document — either a plain reference, or a request to the candidate.
  let requestedDocName: string | undefined;
  if (body.addDocument) {
    const requested = body.addDocument.requestedFromCandidate === true;
    checklist.documents.push({
      name: body.addDocument.name,
      url: body.addDocument.url || undefined,
      requestedFromCandidate: requested,
      requiresSignature: body.addDocument.requiresSignature === true,
      status: requested ? "requested" : undefined,
      uploadedBy: "employer",
      dueDate: body.addDocument.dueDate ? new Date(body.addDocument.dueDate) : undefined,
      uploadedAt: new Date(),
    });
    if (requested) requestedDocName = body.addDocument.name;
    checklist.markModified("documents");
  }
  // Review a document: approve it, or send it back to the candidate for a new copy.
  let reviewed: { name: string; outcome: "approved" | "sent_back"; note?: string } | undefined;
  if (body.document) {
    const doc = checklist.documents[body.document.index];
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (body.document.status === "requested" && doc.requestedFromCandidate) {
      // Sent back: the rejected file and its signature no longer count, so the
      // candidate starts this one again and sees why.
      doc.status = "requested";
      doc.url = undefined;
      doc.signature = undefined;
      doc.reviewNote = body.document.reviewNote;
      reviewed = { name: doc.name, outcome: "sent_back", note: body.document.reviewNote };
    } else if (body.document.status) {
      const wasApproved = doc.status === "approved";
      doc.status = body.document.status;
      if (body.document.status === "approved") {
        doc.reviewNote = undefined;
        if (doc.requestedFromCandidate && !wasApproved) reviewed = { name: doc.name, outcome: "approved" };
      }
    }
    checklist.markModified("documents");
  }
  if (body.removeDocumentIndex !== undefined && checklist.documents[body.removeDocumentIndex]) {
    checklist.documents.splice(body.removeDocumentIndex, 1);
    checklist.markModified("documents");
  }

  // Derive status from task completion unless explicitly overridden.
  if (body.status) {
    checklist.status = body.status;
  } else if (checklist.tasks.length > 0) {
    const allDone = checklist.tasks.every((task: IOnboardingTask) => task.completed);
    const anyDone = checklist.tasks.some((task: IOnboardingTask) => task.completed);
    checklist.status = allDone ? "completed" : anyDone ? "in_progress" : checklist.status;
  }

  await checklist.save();

  // Tell the candidate what just happened to a document of theirs: a new
  // request, an approval, or a request for a new copy. Without the last two
  // they uploaded into silence.
  const candidateNotice = requestedDocName
    ? {
        document: requestedDocName,
        title: "Onboarding document requested",
        message: `Your new employer has requested a document: "${requestedDocName}". Please upload it from your onboarding page.`,
      }
    : reviewed?.outcome === "approved"
      ? {
          document: reviewed.name,
          title: "Onboarding document approved",
          message: `Your employer approved "${reviewed.name}". There is nothing more to do for this document.`,
        }
      : reviewed?.outcome === "sent_back"
        ? {
            document: reviewed.name,
            title: "A new copy of your document is needed",
            message: `Your employer asked you to send "${reviewed.name}" again: ${reviewed.note ?? ""}`.trim(),
          }
        : undefined;
  if (candidateNotice) {
    const candidateUserId = (placement as { jobSeekerId?: { userId?: { _id?: unknown } } })?.jobSeekerId?.userId?._id;
    if (candidateUserId) {
      await notify({
        actorId: ctx.userId,
        userId: String(candidateUserId),
        type: "system",
        title: candidateNotice.title,
        message: candidateNotice.message,
        link: `/${ctx.locale}/job-seeker/onboarding`,
        sendEmail: true,
        metadata: { onboardingId: String(checklist._id), document: candidateNotice.document },
      }).catch(() => { /* non-blocking */ });
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "onboarding.update",
    resource: "placements",
    resourceId: String(params?.id),
    req,
  }).catch(() => { /* non-blocking */ });

  return NextResponse.json({ onboarding: await forEmployer(checklist) });
}

export const GET = withAuth(getHandler, { resource: "placements", action: "read" });
export const POST = withAuth(postHandler, { resource: "placements", action: "update" });
export const PATCH = withAuth(patchHandler, { resource: "placements", action: "update" });
