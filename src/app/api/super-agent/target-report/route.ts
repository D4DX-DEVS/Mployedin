import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { enrichProfile, enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import User from "@/models/User";
import Commission from "@/models/Commission";
import Agent from "@/models/Agent";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/super-agent/target-report                                */
/*  Target report: own + team trends, YoY, business volume             */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const compareYear = year - 1;

  // Get team scope
  const scope = await getSuperAgentScope(ctx.userId);
  const agentDocs = scope
    ? await Agent.find({ _id: { $in: scope.effectiveAgentIds } }).select("_id userId").lean()
    : [];
  const teamUserIds = agentDocs.map((agent) => String(agent.userId));

  // Own profile
  const ownProfile = await TargetProfile.findOne({
    assigneeId: ctx.userId,
    assigneeRole: "super_agent",
    year,
    status: "active",
  }).lean();

  const ownPrev = await TargetProfile.findOne({
    assigneeId: ctx.userId,
    assigneeRole: "super_agent",
    year: compareYear,
    status: "active",
  }).lean();

  // Team profiles (current & prev year)
  const teamCurrent = await TargetProfile.find({
    assigneeId: { $in: teamUserIds },
    assigneeRole: "agent",
    year,
    status: "active",
  }).lean();

  const teamPrev = await TargetProfile.find({
    assigneeId: { $in: teamUserIds },
    assigneeRole: "agent",
    year: compareYear,
    status: "active",
  }).lean();

  // Resolve users
  const allUserIds = [...new Set([ctx.userId, ...teamUserIds])];
  const users = await User.find({ _id: { $in: allUserIds } }).select("_id name email").lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Enrich
  const enrichedOwn = ownProfile
    ? await enrichProfile(ownProfile as unknown as Record<string, unknown>)
    : null;
  const enrichedOwnPrev = ownPrev
    ? await enrichProfile(ownPrev as unknown as Record<string, unknown>)
    : null;
  const enrichedTeam = teamCurrent.length > 0
    ? await enrichProfiles(teamCurrent as unknown as Record<string, unknown>[])
    : [];
  const enrichedTeamPrev = teamPrev.length > 0
    ? await enrichProfiles(teamPrev as unknown as Record<string, unknown>[])
    : [];

  // --- Monthly Trend (own + team aggregated) ---
  const allCurrentProfiles = [...(enrichedOwn ? [enrichedOwn] : []), ...enrichedTeam];
  const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const data = { month, employerTarget: 0, employeeTarget: 0, financeTarget: 0, employerAchieved: 0, employeeAchieved: 0, financeAchieved: 0 };
    for (const profile of allCurrentProfiles) {
      const ma = profile.monthlyAchievements.find((m) => m.month === month);
      if (ma) {
        data.employerTarget += ma.employerTarget;
        data.employeeTarget += ma.employeeTarget;
        data.financeTarget += ma.financeTarget;
        data.employerAchieved += ma.employerAchieved;
        data.employeeAchieved += ma.employeeAchieved;
        data.financeAchieved += ma.financeAchieved;
      }
    }
    return data;
  });

  // --- YoY Comparison ---
  const sumMetrics = (profiles: typeof enrichedTeam) => ({
    employerTarget: profiles.reduce((s, p) => s + p.employerTarget, 0),
    employeeTarget: profiles.reduce((s, p) => s + p.employeeTarget, 0),
    financeTarget: profiles.reduce((s, p) => s + p.financeTarget, 0),
    employerAchieved: profiles.reduce((s, p) => s + p.employerAchieved, 0),
    employeeAchieved: profiles.reduce((s, p) => s + p.employeeAchieved, 0),
    financeAchieved: profiles.reduce((s, p) => s + p.financeAchieved, 0),
    avgProgress: profiles.length > 0
      ? Math.round(profiles.reduce((s, p) => s + p.overallProgress, 0) / profiles.length)
      : 0,
  });

  const currentSummary = sumMetrics(allCurrentProfiles);
  const allPrevProfiles = [...(enrichedOwnPrev ? [enrichedOwnPrev] : []), ...enrichedTeamPrev];
  const prevSummary = sumMetrics(allPrevProfiles);

  const yoyGrowth = (curr: number, prev: number) =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;

  const yearOverYear = {
    currentYear: { year, ...currentSummary },
    previousYear: { year: compareYear, ...prevSummary },
    growth: {
      employerAchieved: yoyGrowth(currentSummary.employerAchieved, prevSummary.employerAchieved),
      employeeAchieved: yoyGrowth(currentSummary.employeeAchieved, prevSummary.employeeAchieved),
      financeAchieved: yoyGrowth(currentSummary.financeAchieved, prevSummary.financeAchieved),
      avgProgress: yoyGrowth(currentSummary.avgProgress, prevSummary.avgProgress),
    },
  };

  // --- Business Volume (team commissions) ---
  const agentDocIds = agentDocs.map((agent) => agent._id);

  const businessVolumeAgg = await Commission.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(year, 0, 1), $lte: new Date(year, 11, 31, 23, 59, 59, 999) },
        $or: [
          { agentId: { $in: agentDocIds } },
          { superAgentId: ctx.userId },
        ],
      },
    },
    {
      $group: {
        _id: { month: { $month: "$createdAt" }, status: "$status" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const businessVolume = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const approved = businessVolumeAgg.filter(
      (a) => a._id.month === month && ["approved", "paid"].includes(a._id.status)
    );
    const all = businessVolumeAgg.filter((a) => a._id.month === month);
    return {
      month,
      approved: approved.reduce((s, a) => s + (a.total ?? 0), 0),
      total: all.reduce((s, a) => s + (a.total ?? 0), 0),
      count: all.reduce((s, a) => s + (a.count ?? 0), 0),
    };
  });

  // --- Team breakdown ---
  const teamBreakdown = enrichedTeam.map((p) => {
    const user = userMap.get(p.assigneeId);
    return {
      _id: p._id,
      assigneeId: p.assigneeId,
      assigneeName: user?.name ?? "Unknown",
      employerTarget: p.employerTarget,
      employeeTarget: p.employeeTarget,
      financeTarget: p.financeTarget,
      employerAchieved: p.employerAchieved,
      employeeAchieved: p.employeeAchieved,
      financeAchieved: p.financeAchieved,
      overallProgress: p.overallProgress,
      riskScore: p.riskScore,
      incentiveTier: p.incentiveTier,
    };
  }).sort((a, b) => b.overallProgress - a.overallProgress);

  return NextResponse.json({
    year,
    ownProfile: enrichedOwn ? {
      ...enrichedOwn,
      assigneeName: userMap.get(ctx.userId)?.name ?? "You",
    } : null,
    monthlyTrend,
    yearOverYear,
    businessVolume,
    totalBusinessVolume: businessVolume.reduce((s, m) => s + m.total, 0),
    teamBreakdown,
    summary: currentSummary,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
