import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Job from "@/models/Job";
import { validateBody } from "@/lib/validators";
import { applicationUpdateSchema } from "@/lib/validators/applications";
import { notify, notifyStatusChange } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

interface WorkflowSettings {
  aiAutoScreen?: boolean;
  notifyOnStageChange?: boolean;
  autoRejectBelow?: number;
}

interface EmpLean {
  _id: unknown;
  userId?: unknown;
  workflow?: { settings?: WorkflowSettings };
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();

  const application = await Application.findById(params?.id).populate("jobId", "employerId title");
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Ownership check for employers — capture emp for automation rules below
  let emp = null as EmpLean | null;
  if (ctx.role === "employer") {
    emp = (await Employer.findOne({ userId: ctx.userId }).select("_id userId workflow").lean()) as EmpLean | null;
    const job = application.jobId as unknown as { employerId: string };
    if (!emp || String(job.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "job_seeker") {
    // Job seekers may only withdraw their own application
    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker || String(application.jobSeekerId) !== String(seeker._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!["agent", "super_agent", "admin"].includes(ctx.role)) {
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

  // Automation: auto-reject if aiMatchScore is below threshold (applies when score is in body via future scoring endpoint)
  // For now, check existing score when a manual status change is attempted
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

    // Automation: notify employer on stage change if setting enabled
    if (notifyOnStageChange && emp?.userId) {
      const empUserId = String(emp.userId);
      await notify({
        userId: empUserId,
        type: "system",
        title: "Application stage changed",
        message: `An application for "${jobTitle}" moved to ${effectiveStatus.replace(/_/g, " ")}.`,
        link: `/employer/applications`,
        sendEmail: false,
      }).catch(() => { /* non-blocking */ });
    }

    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const seeker = await JobSeeker.findById(application.jobSeekerId).select("userId").lean() as { userId?: unknown } | null;
    if (seeker?.userId) {
      await notifyStatusChange(
        String(seeker.userId),
        jobTitle,
        effectiveStatus.replace(/_/g, " "),
        String(application._id)
      ).catch(() => { /* non-blocking */ });
    }
  }

  return NextResponse.json({ application });
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const application = await Application.findById(params?.id)
    .populate("jobId", "title location salary employerId")
    .populate("jobSeekerId", "name email phone skills")
    .lean();

  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership / role check
  const appJobSeeker = String((application as unknown as { jobSeekerId?: { _id?: unknown } }).jobSeekerId?._id ?? (application as unknown as { jobSeekerId?: unknown }).jobSeekerId ?? "");
  const appEmployer = String((application as unknown as { jobId?: { employerId?: unknown } }).jobId?.employerId ?? "");

  if (ctx.role === "job_seeker" && appJobSeeker !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || appEmployer !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  // Agents / super_agents / admins can view any

  return NextResponse.json({ application });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "applications", action: "update" });
