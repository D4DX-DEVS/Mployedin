import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/employers/analytics/pipeline
// Returns full pipeline breakdown: stage distribution, per-job breakdown, conversion rates
async function getHandler(req: NextRequest, ctx: AuthCtx): Promise<NextResponse> {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const employerId = employer._id;
  const { searchParams } = new URL(req.url);
  const jobIdFilter = searchParams.get("jobId");

  const jobs = await Job.find({ employerId }).select("_id title status").lean();
  const allJobIds = jobs.map((j) => j._id);

  if (allJobIds.length === 0) {
    return NextResponse.json({ stageDistribution: [], perJob: [], conversionRates: {}, stalledCount: 0 });
  }

  const matchFilter: Record<string, unknown> = {
    jobId: jobIdFilter
      ? [allJobIds.find((id) => String(id) === jobIdFilter)].filter(Boolean)
      : { $in: allJobIds },
  };

  const PIPELINE_STAGES = ["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"];

  // 1. Stage distribution
  const stageCounts = await Application.aggregate([
    { $match: matchFilter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const stageDistribution = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: stageCounts.find((s) => s._id === stage)?.count ?? 0,
  }));

  // 2. Per-job breakdown (top 20 jobs)
  const perJobData = await Application.aggregate([
    { $match: { jobId: { $in: allJobIds } } },
    {
      $group: {
        _id: { jobId: "$jobId", status: "$status" },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.jobId",
        stages: { $push: { status: "$_id.status", count: "$count" } },
        total: { $sum: "$count" },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 20 },
  ]);

  // Enrich with job titles
  const jobMap = new Map(jobs.map((j) => [String(j._id), j.title]));
  const perJob = perJobData.map((item) => ({
    jobId: String(item._id),
    title: jobMap.get(String(item._id)) ?? "Unknown",
    total: item.total,
    stages: item.stages as { status: string; count: number }[],
  }));

  // 3. Conversion rates (funnel drop-off)
  const total = stageDistribution.find((s) => s.stage === "applied")?.count ?? 0;
  const conversionRates = {
    appliedToShortlisted: pct(stageDistribution.find((s) => s.stage === "shortlisted")?.count ?? 0, total),
    shortlistedToInterview: pct(
      stageDistribution.find((s) => s.stage === "interview_scheduled")?.count ?? 0,
      stageDistribution.find((s) => s.stage === "shortlisted")?.count ?? 0
    ),
    interviewToOffer: pct(
      stageDistribution.find((s) => s.stage === "offer")?.count ?? 0,
      stageDistribution.find((s) => s.stage === "interview_scheduled")?.count ?? 0
    ),
    offerToHired: pct(
      stageDistribution.find((s) => s.stage === "hired")?.count ?? 0,
      stageDistribution.find((s) => s.stage === "offer")?.count ?? 0
    ),
    overallHireRate: pct(stageDistribution.find((s) => s.stage === "hired")?.count ?? 0, total),
  };

  // 4. Stalled applications (in same stage > 7 days without activity)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stalledCount = await Application.countDocuments({
    jobId: { $in: allJobIds },
    status: { $in: ["applied", "shortlisted", "interview_scheduled"] },
    updatedAt: { $lt: sevenDaysAgo },
  });

  return NextResponse.json({
    stageDistribution,
    perJob,
    conversionRates,
    stalledCount,
  });
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export const GET = withAuth(getHandler);
