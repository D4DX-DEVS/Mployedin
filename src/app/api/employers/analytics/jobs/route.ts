import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

interface JobPerformance {
  jobId: string;
  title: string;
  status: string;
  views: number;
  uniqueViews: number;
  applications: number;
  conversionRate: number; // applications / uniqueViews * 100
  avgMatchScore: number;
  createdAt: string;
  daysActive: number;
  insight?: string;
}

// GET /api/employers/analytics/jobs — job performance metrics
async function getHandler(
  _req: NextRequest,
  ctx: AuthCtx
): Promise<NextResponse> {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId })
    .select("_id")
    .lean();
  if (!employer)
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const jobs = await Job.find({ employerId: employer._id })
    .select("_id title status views uniqueViews createdAt")
    .sort({ createdAt: -1 })
    .lean();

  if (jobs.length === 0) {
    return NextResponse.json({ jobs: [], summary: defaultSummary() });
  }

  const jobIds = jobs.map((j) => j._id);

  // Get application counts + avg match score per job
  const appStats = await Application.aggregate([
    { $match: { jobId: { $in: jobIds } } },
    {
      $group: {
        _id: "$jobId",
        count: { $sum: 1 },
        avgScore: { $avg: { $ifNull: ["$aiMatchScore", 0] } },
      },
    },
  ]);

  const appMap = new Map(
    appStats.map((a) => [
      String(a._id),
      { count: a.count as number, avgScore: a.avgScore as number },
    ])
  );

  const jobPerformance: JobPerformance[] = jobs.map((job) => {
    const stats = appMap.get(String(job._id)) || { count: 0, avgScore: 0 };
    const uv = (job as unknown as { uniqueViews?: number }).uniqueViews ?? 0;
    const views = job.views ?? 0;
    const conversionRate =
      uv > 0 ? Math.round((stats.count / uv) * 1000) / 10 : 0;
    const daysActive = Math.max(
      1,
      Math.ceil(
        (Date.now() - new Date(job.createdAt).getTime()) / 86_400_000
      )
    );

    let insight: string | undefined;
    if (views >= 50 && conversionRate < 2) {
      insight =
        "High views but low applications — consider revising the job title, salary range, or requirements.";
    } else if (views < 10 && daysActive > 7) {
      insight =
        "Very few views — try adding more relevant tags or sharing the listing on social media.";
    } else if (conversionRate > 15) {
      insight = "Excellent conversion rate — this listing is performing well!";
    }

    return {
      jobId: String(job._id),
      title: job.title,
      status: job.status,
      views,
      uniqueViews: uv,
      applications: stats.count,
      conversionRate,
      avgMatchScore: Math.round(stats.avgScore * 10) / 10,
      createdAt: job.createdAt.toISOString().split("T")[0],
      daysActive,
      insight,
    };
  });

  // Summary stats
  const totalViews = jobPerformance.reduce((s, j) => s + j.views, 0);
  const totalUniqueViews = jobPerformance.reduce(
    (s, j) => s + j.uniqueViews,
    0
  );
  const totalApplications = jobPerformance.reduce(
    (s, j) => s + j.applications,
    0
  );
  const overallConversion =
    totalUniqueViews > 0
      ? Math.round((totalApplications / totalUniqueViews) * 1000) / 10
      : 0;
  const activeJobs = jobPerformance.filter((j) => j.status === "active").length;
  const underperforming = jobPerformance.filter(
    (j) => j.views >= 50 && j.conversionRate < 2
  ).length;

  return NextResponse.json({
    jobs: jobPerformance,
    summary: {
      totalJobs: jobs.length,
      activeJobs,
      totalViews,
      totalUniqueViews,
      totalApplications,
      overallConversion,
      underperforming,
    },
  });
}

function defaultSummary() {
  return {
    totalJobs: 0,
    activeJobs: 0,
    totalViews: 0,
    totalUniqueViews: 0,
    totalApplications: 0,
    overallConversion: 0,
    underperforming: 0,
  };
}

export const GET = withAuth(getHandler, {
  resource: "employers",
  action: "read",
});
