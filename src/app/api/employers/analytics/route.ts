import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { Placement } from "@/models/Placement";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

interface FunnelStage {
  stage: string;
  count: number;
}

interface TrendData {
  date: string;
  count: number;
}

interface TopJob {
  jobId: string;
  title: string;
  count: number;
}

interface ConversionMetrics {
  applied: number;
  shortlisted: number;
  interview: number;
  selected: number;
  hired: number;
}

interface AnalyticsResponse {
  funnel: FunnelStage[];
  trend: TrendData[];
  topJobs: TopJob[];
  conversion: ConversionMetrics;
}

// GET /api/employers/analytics — analytics dashboard for employer
async function getHandler(_req: NextRequest, ctx: AuthCtx): Promise<NextResponse> {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  // Find employer by userId
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const employerId = employer._id;

  // Get all job IDs for this employer
  const jobs = await Job.find({ employerId }).select("_id").lean();
  const jobIds = jobs.map((job) => job._id);

  if (jobIds.length === 0) {
    // No jobs, return empty analytics
    return NextResponse.json({
      funnel: [],
      trend: [],
      topJobs: [],
      conversion: {
        applied: 0,
        shortlisted: 0,
        interview: 0,
        selected: 0,
        hired: 0,
      },
    } as AnalyticsResponse, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  }

  // 1. FUNNEL: Group applications by status
  const funnelData = await Application.aggregate([
    { $match: { jobId: { $in: jobIds } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const statusOrder = ["applied", "shortlisted", "interview_scheduled", "selected", "rejected", "withdrawn"];
  const funnel: FunnelStage[] = statusOrder
    .map((status) => {
      const found = funnelData.find((f) => f._id === status);
      return {
        stage: status,
        count: found ? found.count : 0,
      };
    })
    .filter((f) => f.count > 0); // Filter out zero counts for cleaner visualization

  // 2. TREND: Applications per day for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const trendData = await Application.aggregate([
    {
      $match: {
        jobId: { $in: jobIds },
        appliedAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$appliedAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Ensure all 30 days are represented
  const trend: TrendData[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(thirtyDaysAgo);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const found = trendData.find((t) => t._id === dateStr);
    trend.push({
      date: dateStr,
      count: found ? found.count : 0,
    });
  }

  // 3. TOP JOBS: Group by jobId, get title via lookup, top 5
  const topJobsData = await Application.aggregate([
    { $match: { jobId: { $in: jobIds } } },
    { $group: { _id: "$jobId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "jobs",
        localField: "_id",
        foreignField: "_id",
        as: "job",
      },
    },
    {
      $project: {
        jobId: "$_id",
        title: { $arrayElemAt: ["$job.title", 0] },
        count: 1,
      },
    },
  ]);

  const topJobs: TopJob[] = topJobsData.map((tj) => ({
    jobId: tj.jobId.toString(),
    title: tj.title || "Unknown Job",
    count: tj.count,
  }));

  // 4. CONVERSION METRICS
  const conversionStages = await Application.aggregate([
    { $match: { jobId: { $in: jobIds } } },
    {
      $facet: {
        applied: [{ $match: { status: "applied" } }, { $count: "count" }],
        shortlisted: [{ $match: { status: "shortlisted" } }, { $count: "count" }],
        interview: [{ $match: { status: "interview_scheduled" } }, { $count: "count" }],
        selected: [{ $match: { status: "selected" } }, { $count: "count" }],
      },
    },
  ]);

  const conversionData = conversionStages[0];

  // Count placements for "hired"
  const hiredCount = await Placement.countDocuments({ employerId });

  const conversion: ConversionMetrics = {
    applied: conversionData.applied[0]?.count || 0,
    shortlisted: conversionData.shortlisted[0]?.count || 0,
    interview: conversionData.interview[0]?.count || 0,
    selected: conversionData.selected[0]?.count || 0,
    hired: hiredCount,
  };

  const response: AnalyticsResponse = {
    funnel,
    trend,
    topJobs,
    conversion,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
