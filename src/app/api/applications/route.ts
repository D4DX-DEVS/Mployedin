import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { Employer } from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { applicationCreateSchema } from "@/lib/validators/applications";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { computeBehaviorSignals } from "@/lib/behaviorSignals";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/applications — paginated list (filtered by role)
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const status = searchParams.get("status") ?? "";
  const jobId = searchParams.get("jobId") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (ctx.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 } });
    query.jobSeekerId = seeker._id;
  } else if (ctx.role === "employer") {
    // Get all jobs for this employer then filter
    const { Employer } = await import("@/models/Employer");
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 } });
    const jobs = await Job.find({ employerId: emp._id }).select("_id").lean();
    query.jobId = { $in: jobs.map((j) => j._id) };
  } else if (ctx.role === "agent") {
    // Agent sees applications for their jobs + jobs from assigned employers
    const { Agent } = await import("@/models/Agent");
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agentDoc) return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 } });
    const jobFilter: Record<string, unknown> = {
      $or: [
        { agentId: agentDoc._id },
        ...(agentDoc.assignedEmployerIds?.length
          ? [{ employerId: { $in: agentDoc.assignedEmployerIds } }]
          : []),
      ],
    };
    const agentJobs = await Job.find(jobFilter).select("_id").lean();
    query.jobId = { $in: agentJobs.map((j) => j._id) };
  }

  if (status) query.status = status;
  if (jobId) query.jobId = jobId;

  const skip = (page - 1) * limit;
  const [applications, total] = await Promise.all([
    Application.find(query)
      .sort({ appliedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("jobId", "title location salary category employerId")
      .populate({
        path: "jobSeekerId",
        select: "userId skills currentLocation totalExperienceYears experience cv.originalUrl",
        populate: { path: "userId", select: "name email" },
      })
      .lean(),
    Application.countDocuments(query),
  ]);

  // For employer/agent view: compute cross-application counts per candidate
  let crossAppCounts: Record<string, number> = {};
  if ((ctx.role === "employer" || ctx.role === "agent") && applications.length > 0) {
    const seekerIds = [...new Set(applications.map((a) => String(a.jobSeekerId?._id)))];
    const counts = await Application.aggregate([
      { $match: { ...query, jobSeekerId: { $in: seekerIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: "$jobSeekerId", count: { $sum: 1 } } },
    ]);
    crossAppCounts = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  }

  return NextResponse.json({
    applications: applications.map((app) => ({
      ...app,
      otherApplicationsCount: Math.max(0, (crossAppCounts[String(app.jobSeekerId?._id)] ?? 1) - 1),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// POST /api/applications — apply for a job
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.applications);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can apply" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, applicationCreateSchema);
  const { jobId, coverLetter } = body;

  const job = await Job.findById(jobId).lean();
  if (!job || job.status !== "active") {
    return NextResponse.json({ error: "Job not found or inactive" }, { status: 404 });
  }

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).lean();
  if (!seeker) {
    return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });
  }

  const existing = await Application.findOne({ jobSeekerId: seeker._id, jobId }).lean();
  if (existing) {
    return NextResponse.json({ error: "Already applied to this job" }, { status: 409 });
  }

  // Check employer's autoRejectBelow threshold for newly scored applications
  // (score would be set by a separate scoring step; we set initial status here)
  const empRecord = await Employer.findOne({ userId: job.employerId as unknown as string })
    .select("workflow")
    .lean() as { workflow?: { settings?: { autoRejectBelow?: number } } } | null;
  const autoRejectBelow = empRecord?.workflow?.settings?.autoRejectBelow;

  const seekerDoc = seeker as { _id: unknown; profileCompleteness?: number; updatedAt?: Date; documents?: { name: string; url: string; type: string }[] };
  const isEasyApply = !!body.easyApply;
  const { signals, score: bScore } = computeBehaviorSignals({
    profileCompleteness: seekerDoc.profileCompleteness ?? 0,
    documents: seekerDoc.documents ?? [],
    coverLetter,
    source: isEasyApply ? "easy_apply" : "full_form",
    autoApplied: false,
    lastActiveAt: seekerDoc.updatedAt,
  });

  const application = await Application.create({
    jobSeekerId: seeker._id,
    jobId,
    employerId: job.employerId,
    coverLetter,
    source: isEasyApply ? 'easy_apply' : 'full_form',
    status: "applied",
    appliedAt: new Date(),
    statusHistory: [{ status: "applied", changedAt: new Date(), note: "Application submitted" }],
    behaviorSignals: signals,
    behaviorScore: bScore,
  });

  // If employer has auto-reject threshold and score already known, apply it immediately
  // (In practice score is set post-creation; this guard handles edge cases)
  if (autoRejectBelow !== undefined && application.aiMatchScore !== undefined && application.aiMatchScore < autoRejectBelow) {
    application.status = "rejected";
    application.rejectionReason = `AI match score (${application.aiMatchScore}) below employer threshold`;
    application.statusHistory.push({ status: "rejected", changedAt: new Date(), note: "Auto-rejected by pipeline rule" });
    await application.save();
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "application.create",
    resource: "applications",
    resourceId: String(application._id),
    meta: { jobId },
    req,
  });

  return NextResponse.json({ application }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
