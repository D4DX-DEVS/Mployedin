import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { AI_TOKEN_LIMITS, redactPII, sanitizeAIInput } from "@/lib/ai/sanitize";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin" && ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.applications);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();

  // A super-agent's analytics must cover only their own portfolio; admin is
  // unscoped. Prepended to every pipeline below.
  const employerIds = await getScopedEmployerIds(ctx);
  const scopeStage =
    employerIds === null ? [] : [{ $match: { employerId: { $in: employerIds } } }];

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    statusDist,
    sourceDist,
    weeklyTrend,
    topJobs,
    scoreDistribution,
    avgTimeInStatus,
  ] = await Promise.all([
    Application.aggregate([
      ...scopeStage,
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Application.aggregate([
      ...scopeStage,
      { $group: { _id: { $ifNull: ["$source", "full_form"] }, count: { $sum: 1 } } },
    ]),
    Application.aggregate([
      ...scopeStage,
      { $match: { appliedAt: { $gte: monthAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$appliedAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Application.aggregate([
      ...scopeStage,
      { $match: { appliedAt: { $gte: monthAgo } } },
      {
        $group: {
          _id: "$jobId",
          count: { $sum: 1 },
          avgScore: { $avg: "$aiMatchScore" },
        },
      },
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
      { $unwind: { path: "$job", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "employers",
          localField: "job.employerId",
          foreignField: "_id",
          as: "employer",
        },
      },
      { $unwind: { path: "$employer", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          count: 1,
          avgScore: 1,
          jobTitle: "$job.title",
          company: "$employer.companyName",
        },
      },
    ]),
    Application.aggregate([
      ...scopeStage,
      { $match: { aiMatchScore: { $exists: true, $ne: null } } },
      {
        $bucket: {
          groupBy: "$aiMatchScore",
          boundaries: [0, 20, 40, 60, 80, 101],
          default: "unknown",
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    Application.aggregate([
      ...scopeStage,
      { $match: { "statusHistory.1": { $exists: true } } },
      { $unwind: "$statusHistory" },
      { $sort: { "statusHistory.changedAt": 1 } },
      {
        $group: {
          _id: "$_id",
          firstStatus: { $first: "$statusHistory" },
          lastStatus: { $last: "$statusHistory" },
          totalStatuses: { $sum: 1 },
        },
      },
      {
        $project: {
          daysInPipeline: {
            $divide: [
              { $subtract: ["$lastStatus.changedAt", "$firstStatus.changedAt"] },
              1000 * 60 * 60 * 24,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgDays: { $avg: "$daysInPipeline" },
          maxDays: { $max: "$daysInPipeline" },
        },
      },
    ]),
  ]);

  const dataSnapshot = {
    statusDistribution: Object.fromEntries(statusDist.map((s) => [s._id, s.count])),
    sourceDistribution: Object.fromEntries(sourceDist.map((s) => [s._id, s.count])),
    totalApps: statusDist.reduce((sum, s) => sum + s.count, 0),
    weeklyTrendSummary: weeklyTrend.slice(-7).map((d) => `${d._id}: ${d.count}`).join(", "),
    topJobs: topJobs.map((j) => ({
      title: j.jobTitle ?? "Unknown",
      company: j.company ?? "Unknown",
      applications: j.count,
      avgScore: Math.round(j.avgScore ?? 0),
    })),
    scoreDistribution: scoreDistribution.map((b) => ({
      range: b._id === "unknown" ? "N/A" : `${b._id}-${(b._id as number) + 19}`,
      count: b.count,
    })),
    avgDaysInPipeline: Math.round(avgTimeInStatus[0]?.avgDays ?? 0),
  };

  const prompt = `You are an HR analytics AI assistant. Analyze these application pipeline metrics and provide actionable insights.

DATA:
${sanitizeAIInput(JSON.stringify(dataSnapshot), AI_TOKEN_LIMITS.match)}

Respond in JSON only:
{
  "summary": "2-3 sentence overview of application pipeline health",
  "insights": [
    {"title": "short title", "description": "1-2 sentence insight", "type": "positive|warning|info|action"},
    ...max 5 insights
  ],
  "recommendations": ["action item 1", "action item 2", "action item 3"],
  "healthScore": <0-100 score for overall pipeline health>
}`;

  try {
    const raw = redactPII(
      await generateText(prompt, GEMINI_MODELS.flash, AI_TOKEN_LIMITS.match)
    ).replace(/```json\n?|```/g, "").trim();

    const aiInsights = JSON.parse(raw);

    return NextResponse.json({
      ...aiInsights,
      data: dataSnapshot,
    });
  } catch {
    return NextResponse.json({
      summary: "Unable to generate AI insights at this time.",
      insights: [],
      recommendations: [],
      healthScore: null,
      data: dataSnapshot,
    });
  }
}

export const GET = withAuth(getHandler as Parameters<typeof withAuth>[0], {
  resource: "applications",
  action: "read",
});
