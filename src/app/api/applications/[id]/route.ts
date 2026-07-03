import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { applicationUpdateSchema } from "@/lib/validators/applications";
import { notify, notifyInterviewSelected, notifyOfferMade, notifyRejected, notifyStatusChange } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * Scope guard for agent / super_agent access to a single application, mirroring
 * the applications LIST route. Agents are limited to applications for jobs they
 * own or whose employer is in their assigned set; super_agents to jobs whose
 * agent is within their jurisdiction. Returns 403 when out of scope, else null.
 * Admin / employer / job_seeker are authorized by their own branches.
 */
async function verifyAgentScopeForApplication(
  jobEmployerId: unknown,
  jobAgentId: unknown,
  ctx: AuthCtx
): Promise<NextResponse | null> {
  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    const ok = Boolean(
      agent && (
        String(jobAgentId) === String(agent._id) ||
        ((agent.assignedEmployerIds as unknown[]) ?? []).some((e) => String(e) === String(jobEmployerId))
      )
    );
    return ok ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (ctx.role === "super_agent") {
    const scope = await getSuperAgentScope(ctx.userId);
    const ok = Boolean(jobAgentId && scope?.effectiveAgentIds.some((id) => String(id) === String(jobAgentId)));
    return ok ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

interface WorkflowSettings {
  aiAutoScreen?: boolean;
  notifyOnStageChange?: boolean;
  autoRejectBelow?: number;
}

interface WorkflowStage {
  id: string;
  label: string;
  enabled: boolean;
  autoProgress: boolean;
  order: number;
}

interface EmpLean {
  _id: unknown;
  userId?: unknown;
  companyName?: string;
  workflow?: { settings?: WorkflowSettings; stages?: WorkflowStage[] };
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const application = await Application.findById(params?.id).populate("jobId", "employerId title agentId");
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Ownership check for employers — capture emp for automation rules below
  let emp = null as EmpLean | null;
  const jobDoc = application.jobId as unknown as { employerId: string; agentId?: unknown };

  if (ctx.role === "employer") {
    emp = (await Employer.findOne({ userId: ctx.userId }).select("_id userId companyName workflow").lean()) as EmpLean | null;
    if (!emp || String(jobDoc.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "job_seeker") {
    // Job seekers may only withdraw their own application
    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker || String(application.jobSeekerId) !== String(seeker._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (["agent", "super_agent", "admin"].includes(ctx.role)) {
    // Scope agent/super_agent to their assigned applications (admin is global)
    if (ctx.role !== "admin") {
      const scopeErr = await verifyAgentScopeForApplication(jobDoc?.employerId, jobDoc?.agentId, ctx);
      if (scopeErr) return scopeErr;
    }
    // Fetch employer so workflow automation (autoProgress, notifications) fires for these roles too
    if (jobDoc?.employerId) {
      emp = (await Employer.findOne({ _id: jobDoc.employerId }).select("_id userId companyName workflow").lean()) as EmpLean | null;
    }
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, applicationUpdateSchema);
  const { status, note, rejectionReason, employerNotes, agentNotes, withdrawalReason, withdrawalNote } = body;

  // Auto-reject rule: if employer has autoRejectBelow threshold and aiMatchScore is being implicitly set
  // Also apply when aiMatchScore already exists and new status change would pass auto-reject threshold
  const workflowSettings = emp?.workflow?.settings as WorkflowSettings | undefined;
  const autoRejectBelow = workflowSettings?.autoRejectBelow;
  const notifyOnStageChange = workflowSettings?.notifyOnStageChange ?? true;

  const prevStatus = application.status;

  if (status && status !== application.status) {
    application.status = status;
    application.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy: ctx.userId,
      note: note ?? `Status updated to ${status}`,
    });
  }

  if (rejectionReason !== undefined) application.rejectionReason = rejectionReason;
  if (employerNotes !== undefined) application.employerNotes = employerNotes;
  if (agentNotes !== undefined) application.agentNotes = agentNotes;
  if (withdrawalReason !== undefined) application.withdrawalReason = withdrawalReason;
  if (withdrawalNote !== undefined) application.withdrawalNote = withdrawalNote;

  // Automation: auto-reject if aiMatchScore is below threshold
  if (
    autoRejectBelow !== undefined &&
    application.aiMatchScore !== undefined &&
    application.aiMatchScore < autoRejectBelow &&
    application.status !== "rejected" &&
    !status // only auto-reject if no explicit status override
  ) {
    application.status = "rejected";
    application.rejectionReason = application.rejectionReason ?? `AI match score (${application.aiMatchScore}) below threshold (${autoRejectBelow})`;
    application.statusHistory.push({
      status: "rejected",
      changedAt: new Date(),
      note: `Auto-rejected: AI match score ${application.aiMatchScore} < threshold ${autoRejectBelow}`,
    });
  }

  // AutoProgress: if the current stage has autoProgress enabled, advance to the next enabled stage
  const workflowStages = emp?.workflow?.stages;
  if (
    Array.isArray(workflowStages) &&
    workflowStages.length > 0 &&
    application.status !== "rejected" &&
    application.status !== "withdrawn"
  ) {
    const sorted = [...workflowStages].sort((a, b) => a.order - b.order);
    const currentIdx = sorted.findIndex((s) => s.id === application.status && s.enabled);
    if (currentIdx >= 0 && sorted[currentIdx].autoProgress) {
      const next = sorted.slice(currentIdx + 1).find((s) => s.enabled && s.id !== "rejected");
      if (next) {
        application.status = next.id;
        application.statusHistory.push({
          status: next.id,
          changedAt: new Date(),
          note: "Auto-progressed by workflow rule",
        });
      }
    }
  }

  await application.save();

  const effectiveStatus = application.status;
  const statusChanged = effectiveStatus !== prevStatus;

  if (statusChanged) {
    const jobTitle = (application.jobId as unknown as { title?: string })?.title ?? "a job";

    await logActivity({
      ...actorFromCtx(ctx),
      action: "application.status_change",
      resource: "applications",
      resourceId: params?.id,
      changes: { before: { status: prevStatus }, after: { status: effectiveStatus } },
      req,
    });

    // Always notify employer about stage changes (internal dashboard notification)
    if (emp?.userId) {
      const empUserId = String(emp.userId);
      await notify({
        userId: empUserId,
        type: "system",
        title: "Application stage changed",
        message: `An application for "${jobTitle}" moved to ${effectiveStatus.replace(/_/g, " ")}.`,
        link: `/employer/applications`,
        sendEmail: false,
        titleKey: "stageChangedTitle",
        bodyKey: "stageChangedBody",
        params: { jobTitle, status: effectiveStatus },
      }).catch((err) => { logger.error({ err, applicationId: params?.id, employerId: emp?._id }, "Failed to notify employer about stage change"); });
    }

    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const seeker = await JobSeeker.findById(application.jobSeekerId).select("userId").lean() as { userId?: unknown } | null;
    // Candidate notifications — only for meaningful milestones (not shortlisted/screening)
    if (notifyOnStageChange && seeker?.userId) {
      const seekerUserId = String(seeker.userId);
      const appId = String(application._id);
      const companyName = emp?.companyName ?? "the employer";

      if (effectiveStatus === "interview_scheduled") {
        notifyInterviewSelected(seekerUserId, jobTitle, companyName, appId).catch((err) => { logger.error({ err, applicationId: appId, userId: seekerUserId }, "failed to notify applicant of interview selection"); });
      } else if (effectiveStatus === "offer" || effectiveStatus === "hired") {
        notifyOfferMade(seekerUserId, jobTitle, companyName, appId).catch((err) => { logger.error({ err, applicationId: appId, userId: seekerUserId }, "failed to notify applicant of offer"); });
      } else if (effectiveStatus === "rejected") {
        notifyRejected(seekerUserId, jobTitle, appId).catch((err) => { logger.error({ err, applicationId: appId, userId: seekerUserId }, "failed to notify applicant of rejection"); });
      } else if (["shortlisted", "screening", "interview", "selected"].includes(effectiveStatus)) {
        // Interim pipeline movements — candidates should see progress, not silence.
        notifyStatusChange(seekerUserId, jobTitle, effectiveStatus, appId).catch((err) => { logger.error({ err, applicationId: appId, userId: seekerUserId }, "failed to notify applicant of status change"); });
      }
      // withdrawn — silent (candidate-initiated; notifying them about their own action is noise)
    }
  }

  return NextResponse.json({ application });
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const application = await Application.findById(params?.id)
    .populate({
      path: "jobId",
      select: "title location salary employerId agentId",
      populate: { path: "employerId", select: "companyName logo" },
    })
    .populate("jobSeekerId", "name email phone skills")
    .lean();

  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership / role check
  const appJobSeeker = String((application as unknown as { jobSeekerId?: { _id?: unknown } }).jobSeekerId?._id ?? (application as unknown as { jobSeekerId?: unknown }).jobSeekerId ?? "");
  // employerId may now be a populated object ({ _id, companyName, logo }) — normalize to its id.
  const rawAppEmployer = (application as unknown as { jobId?: { employerId?: unknown } }).jobId?.employerId;
  const appEmployer = String(
    (rawAppEmployer && typeof rawAppEmployer === "object"
      ? (rawAppEmployer as { _id?: unknown })._id
      : rawAppEmployer) ?? ""
  );
  const appAgent = (application as unknown as { jobId?: { agentId?: unknown } }).jobId?.agentId;

  if (ctx.role === "job_seeker") {
    // SECURITY (W4-1): jobSeekerId is a JobSeeker._id, not a User._id. Resolve
    // the caller's JobSeeker doc and compare _ids (mirrors the PATCH handler).
    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker || appJobSeeker !== String(seeker._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || appEmployer !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (ctx.role === "agent" || ctx.role === "super_agent") {
    const scopeErr = await verifyAgentScopeForApplication(appEmployer, appAgent, ctx);
    if (scopeErr) return scopeErr;
  }
  // Admins can view any

  // Include related interviews + offers if requested
  const { searchParams } = new URL(_req.url);
  const include = searchParams.get("include") ?? "";
  const includes = include.split(",").map((s) => s.trim());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = { ...application };

  if (includes.includes("interviews")) {
    const Interview = (await import("@/models/Interview")).default;
    result.interviews = await Interview.find({ applicationId: params?.id })
      .sort({ scheduledAt: -1 })
      .select("type scheduledAt duration location meetLink instructions status interviewRound candidateResponse candidateResponseAt outcome rescheduleCount candidateRescheduleNote")
      .lean();
  }

  if (includes.includes("offers")) {
    const Offer = (await import("@/models/Offer")).default;
    result.offers = await Offer.find({ applicationId: params?.id })
      .sort({ createdAt: -1 })
      .select("salary startDate benefits status expiresAt respondedAt")
      .lean();
  }

  if (includes.includes("documents")) {
    // documents are already on the application object
  }

  return NextResponse.json({ application: result });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "applications", action: "update" });
