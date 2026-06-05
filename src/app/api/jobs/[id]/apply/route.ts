import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import { ActivityEvent, ACTIVITY_PRIORITY } from "@/models/ActivityEvent";
import Employer from "@/models/Employer";
import User from "@/models/User";
import { computeBehaviorSignals } from "@/lib/behaviorSignals";
import { sendEmail } from "@/lib/communications/email";
import { isValidObjectId } from "@/lib/security/sanitize";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { inngest } from "@/lib/inngest/client";
import { logActivity } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * POST /api/jobs/[id]/apply
 *
 * Creates an Application for the current job seeker.
 * Fires an ActivityEvent (priority 1).
 */
async function applyHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // SECURITY (W3-2): parity with POST /api/applications — rate limit the
  // easy-apply path so it cannot be used to bypass the application throttle.
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.applications);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const jobId = params!.id;

  await connectDB();

  const [job, seeker, seekerUser] = await Promise.all([
    Job.findOne({ _id: jobId, deletedAt: null }).select("title employerId status screeningQuestions").lean(),
    JobSeeker.findOne({ userId: ctx.userId }).select("_id fullName profileCompleteness updatedAt").lean(),
    User.findById(ctx.userId).select("email name").lean(),
  ]);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "active") {
    return NextResponse.json({ error: "Job is not active" }, { status: 422 });
  }
  if (!seeker) {
    return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });
  }

  // Duplicate check
  const existing = await Application.findOne({ jobSeekerId: seeker._id, jobId }).lean();
  if (existing) {
    return NextResponse.json({ error: "Already applied to this job" }, { status: 409 });
  }

  // SECURITY (W3-2): easy-apply submits no answer payload, so it cannot satisfy
  // required screening questions. Mirror POST /api/applications and force such
  // jobs through the full application form instead of silently skipping them.
  const screeningQs = (job as { screeningQuestions?: Array<{ required?: boolean }> }).screeningQuestions;
  if (screeningQs?.some((q) => q.required)) {
    return NextResponse.json(
      { error: "This job requires screening questions. Please use the full application form." },
      { status: 400 }
    );
  }

  // Resolve employer info for ActivityEvent metadata and email notification
  const employer = await Employer.findById(job.employerId).select("companyName userId notificationPrefs").lean();
  const company = employer?.companyName ?? "";

  const { signals, score: bScore } = computeBehaviorSignals({
    profileCompleteness: (seeker as { profileCompleteness?: number }).profileCompleteness ?? 0,
    documents: [],
    source: "easy_apply",
    autoApplied: false,
    lastActiveAt: (seeker as { updatedAt?: Date }).updatedAt,
  });

  const application = await Application.create({
    jobSeekerId: seeker._id,
    jobId,
    employerId: job.employerId,
    status: "applied",
    source: "easy_apply",
    autoApplied: false,
    appliedAt: new Date(),
    statusHistory: [{ status: "applied", changedAt: new Date() }],
    behaviorSignals: signals,
    behaviorScore: bScore,
  });

  // Track applicant on the job document for accurate applicant counts (parity with full apply)
  await Job.updateOne({ _id: jobId }, { $addToSet: { applicantIds: seeker._id } });

  // Send emails (non-blocking — don't fail the response if email errors)
  const seekerName = (seeker as { fullName?: string }).fullName ?? seekerUser?.name ?? "Applicant";
  const applicationId = String(application._id);

  // 1. Confirmation to job seeker
  if (seekerUser?.email) {
    sendEmail({
      to: seekerUser.email,
      subject: `Application received — ${job.title} at ${company}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <div style="background:#0a2a6e;padding:20px 24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">MPLOYEDIN</h1></div>
        <div style="padding:24px">
          <p>Hi ${seekerName},</p>
          <p>Your application for <strong>${job.title}</strong> at <strong>${company}</strong> has been received.</p>
          <p style="color:#6b7280;font-size:13px">Application ID: ${applicationId}</p>
        </div>
      </div>`,
      userId: ctx.userId,
    }).catch(() => {});
  }

  // 2. Alert to employer (only if they have emailNewApplicant enabled or pref is unset)
  const employerPrefs = (employer as { notificationPrefs?: { emailNewApplicant?: boolean } } | null)?.notificationPrefs;
  const shouldNotifyEmployer = employerPrefs?.emailNewApplicant !== false;
  if (shouldNotifyEmployer && employer) {
    const employerUser = await User.findById((employer as { userId: unknown }).userId).select("email name").lean();
    if (employerUser?.email) {
      sendEmail({
        to: employerUser.email,
        subject: `New applicant for ${job.title} — ${seekerName}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:#0a2a6e;padding:20px 24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">MPLOYEDIN</h1></div>
          <div style="padding:24px">
            <p>Hi ${employerUser.name},</p>
            <p><strong>${seekerName}</strong> has applied for: <strong>${job.title}</strong>.</p>
            <p style="color:#6b7280;font-size:13px">Manage notifications from your employer dashboard settings.</p>
          </div>
        </div>`,
        userId: String((employer as { userId: unknown }).userId),
      }).catch(() => {});
    }
  }

  // Fire ActivityEvent (non-blocking — don't fail the response if this errors)
  ActivityEvent.create({
    jobSeekerId: seeker._id,
    type: "application_update",
    priority: ACTIVITY_PRIORITY.application_update,
    metadata: {
      applicationId: String(application._id),
      jobId,
      company,
      title: job.title,
      autoApplied: false,
    },
  }).catch(() => {});

  // Fire "Similar Jobs" email (delayed 2h via Inngest)
  inngest.send({
    name: "jobs/similar-after-apply",
    data: {
      userId: ctx.userId,
      jobId,
      jobTitle: job.title,
      companyName: company,
    },
  }).catch(() => {});

  // Audit log
  logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "application.create",
    resource: "applications",
    resourceId: String(application._id),
    meta: { jobId, jobTitle: job.title, company },
    req,
  });

  return NextResponse.json({ success: true, applicationId: String(application._id) }, { status: 201 });
}

export const POST = withAuth(
  withSubscription(applyHandler, { type: "limit", feature: "applicationsSubmitted" }),
);
