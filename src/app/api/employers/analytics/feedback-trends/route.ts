import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import Scorecard from "@/models/Scorecard";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/**
 * GET /api/employers/analytics/feedback-trends
 *
 * Returns aggregate interview feedback trends for the employer:
 * - Average scores per dimension over time (monthly buckets)
 * - Recommendation distribution
 * - Score distribution (histogram)
 * - Top strengths/concerns patterns
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const employerId = emp._id;

  const { searchParams } = new URL(req.url);
  const months = Math.min(24, Math.max(1, parseInt(searchParams.get("months") ?? "6")));
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  // Run all aggregations in parallel
  const [monthlyTrends, recommendationDist, scoreDist, overallAvg, totalCount] =
    await Promise.all([
      // 1. Monthly score averages per dimension
      Scorecard.aggregate([
        { $match: { employerId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            avgTechnical: { $avg: "$scores.technicalSkills" },
            avgCommunication: { $avg: "$scores.communication" },
            avgCultureFit: { $avg: "$scores.cultureFit" },
            avgProblemSolving: { $avg: "$scores.problemSolving" },
            avgMotivation: { $avg: "$scores.motivation" },
            avgOverall: { $avg: "$overallScore" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      // 2. Recommendation distribution
      Scorecard.aggregate([
        { $match: { employerId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: "$recommendation",
            count: { $sum: 1 },
          },
        },
      ]),

      // 3. Overall score distribution (histogram buckets: 1-2, 2-3, 3-4, 4-5)
      Scorecard.aggregate([
        { $match: { employerId, createdAt: { $gte: since } } },
        {
          $bucket: {
            groupBy: "$overallScore",
            boundaries: [1, 2, 3, 4, 5.01],
            default: "other",
            output: { count: { $sum: 1 } },
          },
        },
      ]),

      // 4. Overall averages
      Scorecard.aggregate([
        { $match: { employerId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            avgTechnical: { $avg: "$scores.technicalSkills" },
            avgCommunication: { $avg: "$scores.communication" },
            avgCultureFit: { $avg: "$scores.cultureFit" },
            avgProblemSolving: { $avg: "$scores.problemSolving" },
            avgMotivation: { $avg: "$scores.motivation" },
            avgOverall: { $avg: "$overallScore" },
          },
        },
      ]),

      // 5. Total scorecard count
      Scorecard.countDocuments({ employerId, createdAt: { $gte: since } }),
    ]);

  // Format monthly trends
  const trends = monthlyTrends.map(
    (m: {
      _id: { year: number; month: number };
      avgTechnical: number;
      avgCommunication: number;
      avgCultureFit: number;
      avgProblemSolving: number;
      avgMotivation: number;
      avgOverall: number;
      count: number;
    }) => ({
      month: `${m._id.year}-${String(m._id.month).padStart(2, "0")}`,
      technical: Math.round(m.avgTechnical * 100) / 100,
      communication: Math.round(m.avgCommunication * 100) / 100,
      cultureFit: Math.round(m.avgCultureFit * 100) / 100,
      problemSolving: Math.round(m.avgProblemSolving * 100) / 100,
      motivation: Math.round(m.avgMotivation * 100) / 100,
      overall: Math.round(m.avgOverall * 100) / 100,
      count: m.count,
    }),
  );

  // Format recommendation distribution
  const recommendations: Record<string, number> = {
    strong_yes: 0,
    yes: 0,
    neutral: 0,
    no: 0,
    strong_no: 0,
  };
  for (const r of recommendationDist as { _id: string; count: number }[]) {
    if (r._id in recommendations) {
      recommendations[r._id] = r.count;
    }
  }

  // Format score distribution
  const scoreLabels: Record<number, string> = { 1: "1-2", 2: "2-3", 3: "3-4", 4: "4-5" };
  const distribution = (scoreDist as { _id: number | string; count: number }[]).map((b) => ({
    range: typeof b._id === "number" ? (scoreLabels[b._id] ?? `${b._id}+`) : "other",
    count: b.count,
  }));

  // Overall averages
  const avg = overallAvg[0] ?? {
    avgTechnical: 0,
    avgCommunication: 0,
    avgCultureFit: 0,
    avgProblemSolving: 0,
    avgMotivation: 0,
    avgOverall: 0,
  };

  return NextResponse.json(
    {
      total: totalCount,
      months,
      averages: {
        technical: Math.round(avg.avgTechnical * 100) / 100,
        communication: Math.round(avg.avgCommunication * 100) / 100,
        cultureFit: Math.round(avg.avgCultureFit * 100) / 100,
        problemSolving: Math.round(avg.avgProblemSolving * 100) / 100,
        motivation: Math.round(avg.avgMotivation * 100) / 100,
        overall: Math.round(avg.avgOverall * 100) / 100,
      },
      trends,
      recommendations,
      distribution,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    },
  );
}

export const GET = withAuth(getHandler, {
  resource: "applications",
  action: "read",
});
