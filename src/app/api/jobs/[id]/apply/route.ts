import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import { ActivityEvent, ACTIVITY_PRIORITY } from "@/models/ActivityEvent";
import Employer from "@/models/Employer";
import { computeBehaviorSignals } from "@/lib/behaviorSignals";

/**
 * POST /api/jobs/[id]/apply
 *
 * Creates an Application for the current job seeker.
 * Fires an ActivityEvent (priority 1).
 */
export const POST = withAuth(async (_req: NextRequest, ctx, params) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobId = params?.id;
  if (!jobId) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  await connectDB();

  const [job, seeker] = await Promise.all([
    Job.findById(jobId).select("title employerId status").lean(),
    JobSeeker.findOne({ userId: ctx.userId }).select("_id profileCompleteness updatedAt").lean(),
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

  // Resolve employer info for ActivityEvent metadata
  const employer = await Employer.findById(job.employerId).select("companyName").lean();
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

  return NextResponse.json({ success: true, applicationId: String(application._id) }, { status: 201 });
});
