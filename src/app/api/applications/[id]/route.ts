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
import { normalizeWorkflowStages, isBackwardsStageMove } from "@/lib/hiring/pipeline";
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

  const application = await Application.findById(params?.id).populate("jobId", "employerId title agentId workflow");
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Ownership check for employers — capture emp for automation rules below
  let emp = null as EmpLean | null;
  const jobDoc = application.jobId as unknown as {
    employerId: string;
    agentId?: unknown;
    workflow?: { settings?: WorkflowSettings; stages?: WorkflowStage[] };
  };

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
  const { status, note, rejectionReason, employerNotes, agentNotes, withdrawalReason, withdrawalNote, markViewed, acknowledgeOpenInterview } = body;

  if (ctx.role === "job_seeker" && status && status !== "withdrawn") {
    return NextResponse.json({ error: "Job seekers may only withdraw an application" }, { status: 403 });
  }

  // First employer open — stamp once; drives the "New" badge in the list.
  if (markViewed && ctx.role !== "job_seeker" && !application.viewedByEmployerAt) {
    application.viewedByEmployerAt = new Date();
  }

  // A pure view-stamp must not run workflow automation (auto-reject/auto-progress
  // below would otherwise fire from merely opening the detail panel).
  const onlyMarkViewed =
    markViewed &&
    !status &&
    rejectionReason === undefined &&
    employerNotes === undefined &&
    agentNotes === undefined &&
    withdrawalReason === undefined &&
    withdrawalNote === undefined;
  if (onlyMarkViewed) {
    await application.save();
    return NextResponse.json({ application });
  }

  // Auto-reject rule: if employer has autoRejectBelow threshold and aiMatchScore is being implicitly set
  // Also apply when aiMatchScore already exists and new status change would pass auto-reject threshold
  const jobWorkflow = jobDoc?.workflow;
  const workflowSettings = (jobWorkflow?.settings ?? emp?.workflow?.settings) as WorkflowSettings | undefined;
  const autoRejectBelow = workflowSettings?.autoRejectBelow;
  const notifyOnStageChange = workflowSettings?.notifyOnStageChange ?? true;

  const prevStatus = application.status;

  // A backwards stage move over a live interview is how the funnel silently
  // desyncs from the Interviews tab: the candidate lands back at, say,
  // shortlisted while a scheduled interview stays open, so Overview reads
  // "Interviewing 0" beside "Interviews 1". Answer with 409 and the interview
  // in question; the caller re-sends with acknowledgeOpenInterview once the
  // person has seen it.
  if (status && status !== application.status && !acknowledgeOpenInterview && isBackwardsStageMove(application.status, status)) {
    const InterviewModel = (await import("@/models/Interview")).default;
    const openInterview = await InterviewModel.findOne({
      applicationId: application._id,
      status: { $in: ["scheduled", "confirmed"] },
    })
      .select("scheduledAt interviewRound type status")
      .sort({ scheduledAt: 1 })
      .lean() as { _id: unknown; scheduledAt?: Date; interviewRound?: number; type?: string; status?: string } | null;

    if (openInterview) {
      return NextResponse.json({
        error: "This candidate has an interview that is still open.",
        code: "OPEN_INTERVIEW",
        interview: {
          _id: String(openInterview._id),
          scheduledAt: openInterview.scheduledAt ?? null,
          interviewRound: openInterview.interviewRound ?? 1,
          type: openInterview.type ?? null,
          status: openInterview.status ?? null,
        },
      }, { status: 409 });
    }
  }

  if (status && status !== application.status) {
    application.status = status;
    application.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy: ctx.userId,
      note: note ?? `Status updated to ${status}`,
    });
  }

  // Staff-only fields. A job seeker holds applications:update (to withdraw) and
  // passes the ownership check above, so without this gate they could overwrite
  // the recruiter's private notes via PATCH on their own application.
  const isStaff = ctx.role !== "job_seeker";
  if (isStaff && rejectionReason !== undefined) application.rejectionReason = rejectionReason;
  if (isStaff && employerNotes !== undefined) application.employerNotes = employerNotes;
  if (isStaff && agentNotes !== undefined) application.agentNotes = agentNotes;
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

  // AutoProgress: the job's own workflow wins; otherwise the employer default.
  // Stage ids are normalised so legacy editor ids ("new", "offer_extended", …)
  // can never be written into Application.status.
  const rawStages = jobWorkflow?.stages?.length ? jobWorkflow.stages : emp?.workflow?.stages;
  const workflowStages = Array.isArray(rawStages) ? normalizeWorkflowStages(rawStages) : [];
  if (
    workflowStages.length > 0 &&
    application.status !== "rejected" &&
    application.status !== "withdrawn"
  ) {
    const currentIdx = workflowStages.findIndex((s) => s.id === application.status && s.enabled);
    if (currentIdx >= 0 && workflowStages[currentIdx].autoProgress) {
      const next = workflowStages
        .slice(currentIdx + 1)
        .find((s) => s.enabled && s.id !== "rejected" && s.id !== "withdrawn");
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
    // JobSeeker holds no `name`/`email` of its own — those live on the linked
    // User — so the old "name email phone skills" select returned a seeker with
    // no readable identity at all. Mirror the list endpoint's shape.
    .populate({
      path: "jobSeekerId",
      select: "userId fullName phone skills currentLocation totalExperienceYears",
      populate: { path: "userId", select: "name email avatar" },
    })
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

  // Candidates never see recruiter-internal fields. The list handler already
  // strips these for job_seeker (handlers.ts .select("-employerNotes ...")), but
  // this detail route returned the raw document — leaking employer/agent notes,
  // the rejection reason, AI match gaps and the internal notes thread to the
  // applicant. aiMatchScore stays: the seeker UI renders it.
  if (ctx.role === "job_seeker") {
    for (const key of ["employerNotes", "agentNotes", "rejectionReason", "matchStrengths", "matchGaps", "matchBreakdown", "notes"]) {
      delete result[key];
    }
  }

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
