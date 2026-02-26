import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/applications — paginated list (filtered by role)
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));
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
      .populate("jobSeekerId", "userId")
      .lean(),
    Application.countDocuments(query),
  ]);

  return NextResponse.json({
    applications,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// POST /api/applications — apply for a job
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can apply" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json();
  const { jobId, coverLetter } = body;

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

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

  const application = await Application.create({
    jobSeekerId: seeker._id,
    jobId,
    coverLetter,
    status: "applied",
    appliedAt: new Date(),
    statusHistory: [{ status: "applied", changedAt: new Date(), note: "Application submitted" }],
  });

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
