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
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(5, parseInt(searchParams.get("pageSize") ?? "10", 10) || 10));
  const q = (searchParams.get("q") ?? "").trim();

  const jobs = await Job.find({ employerId }).select("_id title status").lean();
  const allJobIds = jobs.map((j) => j._id);

  if (allJobIds.length === 0) {
    return NextResponse.json({
      stageDistribution: [],
      funnel: [],
      perJob: [],
      perJobMeta: { total: 0, page: 1, pageSize, totalPages: 0 },
      jobOptions: [],
      conversionRates: {},
      stalledCount: 0,
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
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

  // 2. Per-job breakdown — server-side paginated, optional title search.
  // Title filtering happens against the already-fetched (lightweight) jobs
  // list, so the aggregation only scans applications for matching jobs.
  const searchedJobIds = q
    ? jobs.filter((j) => j.title?.toLowerCase().includes(q.toLowerCase())).map((j) => j._id)
    : allJobIds;

  const perJobFacet = await Application.aggregate([
    { $match: { jobId: { $in: searchedJobIds } } },
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
    { $sort: { total: -1, _id: 1 } },
    {
      $facet: {
        meta: [{ $count: "total" }],
        items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        options: [{ $project: { _id: 1, total: 1 } }],
      },
    },
  ]);

  const facet = perJobFacet[0] ?? { meta: [], items: [], options: [] };
  const perJobTotal: number = facet.meta[0]?.total ?? 0;
  const totalPages = Math.ceil(perJobTotal / pageSize);

  // Enrich with job titles
  const jobMap = new Map(jobs.map((j) => [String(j._id), j.title]));
  const perJob = (facet.items as { _id: unknown; total: number; stages: { status: string; count: number }[] }[]).map((item) => ({
    jobId: String(item._id),
    title: jobMap.get(String(item._id)) ?? "Unknown",
    total: item.total,
    stages: item.stages,
  }));

  // Lightweight options list for the scope dropdown (all jobs with apps,
  // independent of pagination/search so the filter always covers everything).
  const jobOptions = q
    ? (await Application.aggregate([
        { $match: { jobId: { $in: allJobIds } } },
        { $group: { _id: "$jobId", total: { $sum: 1 } } },
        { $sort: { total: -1, _id: 1 } },
      ])).map((o) => ({ jobId: String(o._id), title: jobMap.get(String(o._id)) ?? "Unknown", total: o.total }))
    : (facet.options as { _id: unknown; total: number }[]).map((o) => ({
        jobId: String(o._id),
        title: jobMap.get(String(o._id)) ?? "Unknown",
        total: o.total,
      }));

  // 3. Cumulative funnel: how many candidates have EVER reached each stage.
  // Uses current status + statusHistory so conversions are always <= 100%
  // (a candidate at "interview_scheduled" has implicitly passed "shortlisted").
  const FUNNEL_ORDER = ["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired"];
  const maxRankData = await Application.aggregate([
    { $match: matchFilter },
    {
      $project: {
        statuses: {
          $setUnion: [["$status"], { $ifNull: ["$statusHistory.status", []] }],
        },
      },
    },
    {
      $project: {
        maxRank: {
          $max: {
            $map: {
              input: "$statuses",
              as: "s",
              in: { $indexOfArray: [FUNNEL_ORDER, "$$s"] },
            },
          },
        },
      },
    },
    { $group: { _id: "$maxRank", count: { $sum: 1 } } },
  ]);

  // reached[i] = number of applications whose highest-ever stage rank >= i.
  // Every application has at least reached "applied" (rank 0), even if its
  // only recorded statuses are rejected/withdrawn (rank -1).
  const reached = FUNNEL_ORDER.map((stage, rank) => ({
    stage,
    count: maxRankData.reduce(
      (sum, g) => sum + (Math.max(g._id ?? 0, 0) >= rank ? g.count : 0),
      0
    ),
  }));
  const reachedCount = (stage: string) => reached.find((r) => r.stage === stage)?.count ?? 0;

  const total = reachedCount("applied");
  const conversionRates = {
    appliedToShortlisted: pct(reachedCount("shortlisted"), total),
    shortlistedToInterview: pct(reachedCount("interview_scheduled"), reachedCount("shortlisted")),
    interviewToOffer: pct(reachedCount("offer"), reachedCount("interview_scheduled")),
    offerToHired: pct(reachedCount("hired"), reachedCount("offer")),
    overallHireRate: pct(reachedCount("hired"), total),
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
    funnel: reached,
    perJob,
    perJobMeta: { total: perJobTotal, page, pageSize, totalPages },
    jobOptions,
    conversionRates,
    stalledCount,
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export const GET = withAuth(getHandler);
