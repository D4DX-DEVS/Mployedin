import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Scorecard from "@/models/Scorecard";
import { Employer } from "@/models/Employer";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";
import type { ScorecardRecommendation } from "@/models/Scorecard";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

const RECOMMENDATION_WEIGHT: Record<ScorecardRecommendation, number> = {
  strong_yes: 5,
  yes: 4,
  neutral: 3,
  no: 2,
  strong_no: 1,
};

/**
 * GET /api/scorecards/consensus?applicationId=xxx
 * Returns all scorecards for an application grouped by interview round,
 * plus a computed consensus summary (average scores, recommendation distribution, suggested decision).
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (!["employer", "admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const applicationId = searchParams.get("applicationId");
  const interviewId = searchParams.get("interviewId");

  if (!applicationId && !interviewId) {
    return NextResponse.json(
      { error: "applicationId or interviewId is required" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  if (applicationId) {
    if (!isValidObjectId(applicationId)) {
      return NextResponse.json({ error: "Invalid applicationId" }, { status: 400 });
    }
    query.applicationId = applicationId;
  }
  if (interviewId) {
    if (!isValidObjectId(interviewId)) {
      return NextResponse.json({ error: "Invalid interviewId" }, { status: 400 });
    }
    query.interviewId = interviewId;
  }

  // Employer scope check
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ scorecards: [], consensus: null });
    query.employerId = emp._id;
  }

  const scorecards = await Scorecard.find(query)
    .sort({ createdAt: 1 })
    .populate("evaluatedBy", "name email")
    .populate("interviewId", "scheduledAt interviewRound type")
    .lean();

  if (scorecards.length === 0) {
    return NextResponse.json({ scorecards: [], consensus: null });
  }

  // Compute consensus
  const totalEvaluators = scorecards.length;
  const avgScores = {
    technicalSkills: 0,
    communication: 0,
    cultureFit: 0,
    problemSolving: 0,
    motivation: 0,
  };

  const recommendationDistribution: Record<ScorecardRecommendation, number> = {
    strong_yes: 0,
    yes: 0,
    neutral: 0,
    no: 0,
    strong_no: 0,
  };

  let totalOverall = 0;
  let totalRecommendationWeight = 0;

  for (const sc of scorecards) {
    const scores = sc.scores as {
      technicalSkills: number;
      communication: number;
      cultureFit: number;
      problemSolving: number;
      motivation: number;
    };
    avgScores.technicalSkills += scores.technicalSkills;
    avgScores.communication += scores.communication;
    avgScores.cultureFit += scores.cultureFit;
    avgScores.problemSolving += scores.problemSolving;
    avgScores.motivation += scores.motivation;
    totalOverall += sc.overallScore as number;

    const rec = sc.recommendation as ScorecardRecommendation;
    recommendationDistribution[rec]++;
    totalRecommendationWeight += RECOMMENDATION_WEIGHT[rec];
  }

  avgScores.technicalSkills = +(avgScores.technicalSkills / totalEvaluators).toFixed(2);
  avgScores.communication = +(avgScores.communication / totalEvaluators).toFixed(2);
  avgScores.cultureFit = +(avgScores.cultureFit / totalEvaluators).toFixed(2);
  avgScores.problemSolving = +(avgScores.problemSolving / totalEvaluators).toFixed(2);
  avgScores.motivation = +(avgScores.motivation / totalEvaluators).toFixed(2);

  const averageOverall = +(totalOverall / totalEvaluators).toFixed(2);
  const avgRecommendationWeight = totalRecommendationWeight / totalEvaluators;

  // Determine suggested decision from weighted average
  let suggestedDecision: "strong_yes" | "yes" | "neutral" | "no" | "strong_no";
  if (avgRecommendationWeight >= 4.5) suggestedDecision = "strong_yes";
  else if (avgRecommendationWeight >= 3.5) suggestedDecision = "yes";
  else if (avgRecommendationWeight >= 2.5) suggestedDecision = "neutral";
  else if (avgRecommendationWeight >= 1.5) suggestedDecision = "no";
  else suggestedDecision = "strong_no";

  // Check for strong disagreement
  const hasStrongDisagreement =
    (recommendationDistribution.strong_yes > 0 || recommendationDistribution.yes > 0) &&
    (recommendationDistribution.strong_no > 0 || recommendationDistribution.no > 0);

  // Unanimous check
  const uniqueRecommendations = Object.entries(recommendationDistribution)
    .filter(([, count]) => count > 0)
    .map(([rec]) => rec);
  const isUnanimous = uniqueRecommendations.length === 1;

  const consensus = {
    totalEvaluators,
    averageScores: avgScores,
    averageOverall,
    recommendationDistribution,
    suggestedDecision,
    isUnanimous,
    hasStrongDisagreement,
    unanimousRecommendation: isUnanimous ? uniqueRecommendations[0] : null,
  };

  return NextResponse.json({ scorecards, consensus });
}

export const GET = withAuth(getHandler, {
  resource: "applications",
  action: "read",
});
