import { NextRequest, NextResponse } from "next/server";
import type { AuthContext } from "@/lib/auth/withAuth";
import { Error as MongooseError } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { jobUpdateSchema } from "@/lib/validators/jobs";
import { isValidObjectId } from "@/lib/security/sanitize";
import { getScopedEmployerIds, getSuperAgentBook } from "@/lib/auth/agentRestrictions";
import { canTransitionJobStatus, expiryExtended } from "@/lib/jobs/statusTransitions";
import { isEmployerPublishGated, PUBLISH_GATE_ERROR } from "@/lib/employers/publishGate";
import { stripPrivateJobFields } from "@/lib/jobs/visibility";
import { mergeScreeningKnockouts, splitScreeningQuestions, type KnockoutRule } from "@/lib/matching/knockouts";
import { queueApplicantRescore } from "@/lib/inngest/rescoreJobApplicants";
import { memberMayAccessJob } from "@/lib/permissions/team";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; member?: AuthContext["member"] }
type Params = { id: string };


// GET /api/jobs/[id]
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const job = await Job.findOne({ _id: params?.id, deletedAt: null })
    .populate("employerId", "companyName country industry verificationLevel logo")
    .lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // employerId is populated above, so read the id off the populated doc.
  const ownerId = (job.employerId as { _id?: unknown } | null)?._id ?? job.employerId;
  let isOwnerSide: boolean;
  if (ctx.role === "super_agent") {
    // The super-agent's book — the definition /api/super-agent/jobs lists by:
    // a job one of their agents posted, or one at an employer in their book.
    const book = await getSuperAgentBook(ctx.userId);
    isOwnerSide = Boolean(
      book &&
        (book.agentIds.map(String).includes(String(job.agentId ?? "")) ||
          book.employerIds.map(String).includes(String(ownerId)))
    );
  } else {
    const employerIds = await getScopedEmployerIds(ctx);
    // null = unrestricted (admin). Anyone else only counts as the owning side
    // when the job's employer is inside their scope. A colleague limited to
    // some jobs is not the owning side of the others.
    isOwnerSide =
      (employerIds === null || employerIds.map(String).includes(String(ownerId))) &&
      (ctx.role !== "employer" || (await memberMayAccessJob(ctx, ownerId, job._id)));
  }

  // An active job is public to any signed-in user. A non-active one (draft,
  // paused, closed) is only for the owning side — mirrors patchHandler below,
  // which already scopes writes this way.
  if (job.status !== "active" && !isOwnerSide) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!isOwnerSide) {
    stripPrivateJobFields(job as Record<string, unknown>);
  } else {
    // The owner's editors edit a question and its deal-breaker rule as one.
    const record = job as Record<string, unknown>;
    record.screeningQuestions = mergeScreeningKnockouts(
      (record.screeningQuestions as Array<{ id: string }> | undefined) ?? [],
      record.screeningKnockouts as KnockoutRule[] | undefined,
    );
  }

  return NextResponse.json({ job });
}

/**
 * Everything an applicant's score or requirements checklist reads from the
 * job. A save that changes any of them leaves every stored score describing a
 * job that no longer exists.
 */
const SCORING_FIELDS = [
  "title", "requirements", "location", "workMode", "salary",
  "screeningQuestions", "screeningKnockouts",
  // The job's industry is read from these (lib/matching/industry.ts).
  "description", "tags",
] as const;

function scoringSnapshot(job: object): string {
  const doc = (typeof (job as { toObject?: unknown }).toObject === "function"
    ? (job as { toObject: () => Record<string, unknown> }).toObject()
    : job) as Record<string, unknown>;
  return JSON.stringify(SCORING_FIELDS.map((field) => doc[field] ?? null));
}

// PATCH /api/jobs/[id]
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const job = await Job.findById(params?.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Ownership check FIRST — a caller who does not own the job must get 403, not
  // schema-level 400 feedback about what a valid body would look like.
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (
      !emp ||
      String(job.employerId) !== String(emp._id) ||
      !(await memberMayAccessJob(ctx, emp._id, job._id))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "agent") {
    // Scope agent writes to jobs they own or jobs of their assigned employers.
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    const ok = Boolean(
      agent && (
        String(job.agentId) === String(agent._id) ||
        ((agent.assignedEmployerIds as unknown[]) ?? []).some((e) => String(e) === String(job.employerId))
      )
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, jobUpdateSchema);

  // Status moves are guarded for every role, admin included: the five statuses
  // form a small state machine (draft → live → paused/closed, closed is final)
  // and a client that skips a step gets 409, not a silently accepted write.
  const nextStatus = body.status;
  if (nextStatus && nextStatus !== job.status) {
    if (!canTransitionJobStatus(job.status, nextStatus)) {
      return NextResponse.json(
        { error: "INVALID_STATUS_TRANSITION", from: job.status, to: nextStatus },
        { status: 409 },
      );
    }
    if (job.status === "expired" && !expiryExtended((body as { expiresAt?: unknown }).expiresAt)) {
      return NextResponse.json(
        { error: "EXPIRES_AT_REQUIRED", from: job.status, to: nextStatus },
        { status: 409 },
      );
    }
    // Without this an admin-converted employer could save the job as a draft
    // (which the create gate allows) and then simply publish it here, walking
    // straight around the company-profile requirement.
    if (nextStatus === "active" && job.employerId && await isEmployerPublishGated(String(job.employerId))) {
      return NextResponse.json(
        { error: PUBLISH_GATE_ERROR, from: job.status, to: nextStatus },
        { status: 409 },
      );
    }
  }

  // Everyone can update their own job; a few fields stay admin-only.
  const allowedFields = [
    "title", "description", "category", "location", "requirements",
    "salary", "status", "expiresAt", "applicationMode", "tags", "vacancies",
    "maxApplicants", "showSalary", "visibility", "screeningQuestions",
    "employmentType", "workMode", "duration", "responsibilities",
    "qualifications", "benefits", "learningOutcomes",
  ];
  const adminFields = ["featuredUntil"];

  const bodyRecord = body as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};
  for (const f of allowedFields) {
    if (f in bodyRecord) updateData[f] = bodyRecord[f];
  }
  if (Array.isArray(updateData.screeningQuestions)) {
    const { questions, knockouts } = splitScreeningQuestions(
      updateData.screeningQuestions as Parameters<typeof splitScreeningQuestions>[0],
    );
    updateData.screeningQuestions = questions;
    updateData.screeningKnockouts = knockouts;
  }
  const scoringBefore = scoringSnapshot(job);
  if (ctx.role === "admin") {
    for (const f of adminFields) {
      if (f in bodyRecord) updateData[f] = bodyRecord[f];
    }
  }

  Object.assign(job, updateData);
  try {
    // Drafts may be incomplete; full validation applies once leaving draft (matches POST handler)
    await job.save({ validateBeforeSave: job.status !== "draft" });
  } catch (err) {
    if (err instanceof MongooseError.ValidationError) {
      return NextResponse.json(
        { error: "VALIDATION_FAILED", fields: Object.keys(err.errors) },
        { status: 400 },
      );
    }
    throw err;
  }

  if (scoringSnapshot(job) !== scoringBefore) {
    await queueApplicantRescore([String(job._id)]);
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.update",
    resource: "jobs",
    resourceId: params?.id,
    changes: { after: updateData },
    req,
  });

  return NextResponse.json({ job });
}

// DELETE /api/jobs/[id] — soft delete
async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const job = await Job.findById(params?.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (
      !emp ||
      String(job.employerId) !== String(emp._id) ||
      !(await memberMayAccessJob(ctx, emp._id, job._id))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete: mark as deleted instead of removing from DB.
  // Skip schema validation: drafts are allowed to be incomplete (empty
  // description / location), and a delete must never be blocked by that.
  job.deletedAt = new Date();
  if (job.status === "active" || job.status === "paused") {
    job.preDeletionStatus = job.status;
    job.status = "closed";
  }
  await job.save({ validateBeforeSave: false });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.delete",
    resource: "jobs",
    resourceId: params?.id,
    meta: { title: job.title },
    req: _req,
  });

  return NextResponse.json({ message: "Job deleted successfully" });
}

export { getHandler, patchHandler, deleteHandler };
