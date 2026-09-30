import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { isValidObjectId } from "@/lib/security/sanitize";
import { Employer } from "@/models/Employer";
import Application from "@/models/Application";
import BackgroundCheck from "@/models/BackgroundCheck";
import { validateBody } from "@/lib/validators";
import { backgroundCheckCreateSchema } from "@/lib/validators/backgroundChecks";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import logger from "@/lib/logger";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
  /** Present when the caller is a colleague borrowing the owner's workspace. */
  member?: AuthContext["member"];
}

/**
 * GET /api/employer/background-checks (FG-7)
 * Lists the employer's background/reference checks, newest first.
 */
async function listHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const status = url.searchParams.get("status");
  const jobId = url.searchParams.get("jobId");
  const applicationId = url.searchParams.get("applicationId");

  const filter: Record<string, unknown> = { employerId: (emp as { _id: unknown })._id };
  if (status) filter.status = status;
  if (jobId && isValidObjectId(jobId)) filter.jobId = jobId;
  if (applicationId && isValidObjectId(applicationId)) filter.applicationId = applicationId;
  // A colleague opens their own queue. ctx.userId is the company owner once the
  // workspace has been resolved, so the real person is ctx.member.actorId.
  if (url.searchParams.get("assignedToMe") === "true") {
    filter.assignedTo = ctx.member?.actorId ?? ctx.userId;
  }

  const [items, total] = await Promise.all([
    BackgroundCheck.find(filter)
      .populate({ path: "jobSeekerId", select: "fullName userId", populate: { path: "userId", select: "name" } })
      .populate({ path: "jobId", select: "title" })
      // The job worklist shows where each candidate sits, so a check that has
      // overtaken its candidate (or been left behind) is visible at a glance.
      .populate({ path: "applicationId", select: "status" })
      .populate({ path: "assignedTo", select: "name email" })
      .populate({ path: "verifiedBy", select: "name email" })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    BackgroundCheck.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

/**
 * POST /api/employer/background-checks (FG-7)
 * Initiates a background and/or reference check for one of the employer's
 * applications. The application must belong to the caller's employer.
 */
async function createHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id agentId companyName").lean();
  if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  const body = await validateBody(req, backgroundCheckCreateSchema);

  const application = await Application.findById(body.applicationId)
    .select("employerId jobId jobSeekerId")
    .lean();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (String((application as { employerId: unknown }).employerId) !== String((emp as { _id: unknown })._id)) {
    return NextResponse.json({ error: "Forbidden: application not owned by employer" }, { status: 403 });
  }

  const references = (body.references ?? []).map((r) => ({
    name: r.name,
    relationship: r.relationship,
    company: r.company,
    email: r.email || undefined,
    phone: r.phone,
    status: "pending" as const,
  }));

  const check = await BackgroundCheck.create({
    applicationId: body.applicationId,
    jobId: (application as { jobId: unknown }).jobId,
    jobSeekerId: (application as { jobSeekerId: unknown }).jobSeekerId,
    employerId: (emp as { _id: unknown })._id,
    checkType: body.checkType,
    references,
    backgroundNotes: body.backgroundNotes,
    status: references.length > 0 ? "in_progress" : "pending",
    createdBy: ctx.userId,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "background_check.create",
    resource: "applications",
    resourceId: String(check._id),
    req,
  }).catch(() => { /* non-blocking */ });

  notifyAgentOfCheck(emp as EmployerForNotice, (application as { jobId: unknown }).jobId, ctx.member?.actorId ?? ctx.userId)
    .catch((err) => { logger.error({ err, checkId: String(check._id) }, "[background-checks] failed to notify the agent"); });

  return NextResponse.json({ check }, { status: 201 });
}

interface EmployerForNotice { _id: unknown; agentId?: unknown; companyName?: string }

/**
 * The agent who works with this employer hears that a check was requested
 * (client report 2026-09-30). They can follow it on their Background checks
 * page; the employer's team still runs it.
 */
async function notifyAgentOfCheck(emp: EmployerForNotice, jobId: unknown, actorId: string): Promise<void> {
  if (!emp.agentId) return;
  const [{ default: Agent }, { default: Job }] = await Promise.all([import("@/models/Agent"), import("@/models/Job")]);
  const [agent, job] = await Promise.all([
    Agent.findById(emp.agentId).select("userId").lean() as Promise<{ userId?: unknown } | null>,
    Job.findById(jobId).select("title").lean() as Promise<{ title?: string } | null>,
  ]);
  if (!agent?.userId) return;
  const companyName = emp.companyName ?? "";
  const jobTitle = job?.title ?? "";
  await notify({
    userId: String(agent.userId),
    actorId,
    type: "system",
    title: "Background check requested",
    message: `${companyName} requested a background check for "${jobTitle}".`,
    link: "/agent/background-checks",
    sendEmail: false,
    titleKey: "backgroundCheckRequestedTitle",
    bodyKey: "backgroundCheckRequestedBody",
    params: { companyName, jobTitle },
  });
}

export const GET = withAuth(listHandler, { resource: "applications", action: "read" });
export const POST = withAuth(createHandler, { resource: "applications", action: "update" });
