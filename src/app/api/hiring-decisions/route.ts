import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import HiringDecision from "@/models/HiringDecision";
import Scorecard from "@/models/Scorecard";
import { Employer } from "@/models/Employer";
import Application from "@/models/Application";
import { validateBody } from "@/lib/validators";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { z } from "zod";
import type { UserRole } from "@/models/User";
import type { ScorecardRecommendation } from "@/models/Scorecard";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

const RECOMMENDATION_WEIGHT: Record<string, number> = {
  strong_yes: 5,
  yes: 4,
  neutral: 3,
  no: 2,
  strong_no: 1,
};

const hiringDecisionSchema = z.object({
  applicationId: z.string().min(1),
  interviewId: z.string().optional(),
  outcome: z.enum(["advance", "hire", "reject", "hold", "no_decision"]),
  reasoning: z.string().max(2000).trim().optional(),
});

/**
 * GET /api/hiring-decisions?applicationId=xxx
 * List hiring decisions for an application.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (!["employer", "admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const applicationId = searchParams.get("applicationId");

  if (!applicationId || !isValidObjectId(applicationId)) {
    return NextResponse.json({ error: "Valid applicationId is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { applicationId };

  // Everyone but admin is confined to their own employers. `null` is admin.
  const employerIds = await getScopedEmployerIds(ctx);
  if (employerIds !== null) {
    if (employerIds.length === 0) return NextResponse.json({ decisions: [] });
    query.employerId = { $in: employerIds };
  }

  const decisions = await HiringDecision.find(query)
    .sort({ createdAt: -1 })
    .populate("decidedBy", "name email")
    .lean();

  return NextResponse.json({ decisions });
}

/**
 * POST /api/hiring-decisions
 * Record a hiring decision after reviewing panel scorecards.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Only employers can make hiring decisions" }, { status: 403 });
  }

  await connectDB();

  const body = await validateBody(req, hiringDecisionSchema);
  const { applicationId, interviewId, outcome, reasoning } = body;

  if (!isValidObjectId(applicationId)) {
    return NextResponse.json({ error: "Invalid applicationId" }, { status: 400 });
  }

  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  // Verify the application belongs to this employer
  const application = await Application.findById(applicationId).select("employerId").lean();
  if (!application || String(application.employerId) !== String(emp._id)) {
    return NextResponse.json({ error: "Application not found or access denied" }, { status: 404 });
  }

  // Get consensus summary from panel scorecards
  const scorecards = await Scorecard.find({ applicationId, employerId: emp._id }).lean();
  let consensusSummary;
  let overriddenConsensus = false;

  if (scorecards.length > 0) {
    const totalEvaluators = scorecards.length;
    let totalOverall = 0;
    let totalWeight = 0;

    for (const sc of scorecards) {
      totalOverall += sc.overallScore as number;
      const rec = sc.recommendation as ScorecardRecommendation;
      totalWeight += RECOMMENDATION_WEIGHT[rec] ?? 3;
    }

    const averageOverall = +(totalOverall / totalEvaluators).toFixed(2);
    const avgWeight = totalWeight / totalEvaluators;

    let suggestedDecision: string;
    if (avgWeight >= 4.5) suggestedDecision = "strong_yes";
    else if (avgWeight >= 3.5) suggestedDecision = "yes";
    else if (avgWeight >= 2.5) suggestedDecision = "neutral";
    else if (avgWeight >= 1.5) suggestedDecision = "no";
    else suggestedDecision = "strong_no";

    consensusSummary = { totalEvaluators, averageOverall, suggestedDecision };

    // Check if decision overrides consensus
    const positiveConsensus = ["strong_yes", "yes"].includes(suggestedDecision);
    const negativeConsensus = ["strong_no", "no"].includes(suggestedDecision);
    const positiveDecision = ["advance", "hire"].includes(outcome);
    const negativeDecision = outcome === "reject";

    if ((positiveConsensus && negativeDecision) || (negativeConsensus && positiveDecision)) {
      overriddenConsensus = true;
    }
  }

  const decision = new HiringDecision({
    applicationId,
    interviewId: interviewId && isValidObjectId(interviewId) ? interviewId : undefined,
    employerId: emp._id,
    decidedBy: ctx.userId,
    outcome,
    reasoning,
    overriddenConsensus,
    consensusSummary,
  });

  await decision.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "hiring_decision.create",
    resource: "hiring_decisions",
    resourceId: decision._id.toString(),
    meta: { applicationId, outcome, overriddenConsensus, totalEvaluators: consensusSummary?.totalEvaluators ?? 0 },
    req,
  });

  return NextResponse.json({ decision: decision.toObject() }, { status: 201 });
}

export const GET = withAuth(getHandler, {
  resource: "applications",
  action: "read",
});

export const POST = withAuth(postHandler, { resource: "applications", action: "update" });
