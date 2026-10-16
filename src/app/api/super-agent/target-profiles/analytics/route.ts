import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import User from "@/models/User";
import { enrichProfile, enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import { getSuperAgentTeam } from "@/lib/auth/agentRestrictions";

interface AuthCtx { userId: string; role: string; locale: string; }

const round2 = (value: number) => Math.round(value * 100) / 100;

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));

  const ownProfile = await TargetProfile.findOne({
    ...PROFIT_TARGET_FILTER,
    assigneeId: ctx.userId,
    year,
    assigneeRole: "super_agent",
    status: { $ne: "cancelled" },
  }).lean();

  // The team is the agents funded from this supervisor's target. With no plan
  // there is no team to analyse, never somebody else's agents.
  const team = ownProfile ? await getSuperAgentTeam(ctx.userId) : null;
  const agentProfiles = ownProfile && team?.agentUserIds.length
    ? await TargetProfile.find({
        ...PROFIT_TARGET_FILTER,
        year,
        assigneeRole: "agent",
        status: { $ne: "cancelled" },
        parentProfileId: ownProfile._id,
        assigneeId: { $in: team.agentUserIds },
      }).lean()
    : [];

  const [ownKpi, enrichedTeam] = await Promise.all([
    ownProfile ? enrichProfile(ownProfile as unknown as Record<string, unknown>) : Promise.resolve(null),
    enrichProfiles(agentProfiles as unknown as Record<string, unknown>[]),
  ]);

  const userIds = [...new Set(enrichedTeam.map((profile) => profile.assigneeId))];
  const users = await User.find({ _id: { $in: userIds } }).select("_id name email").lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  const rankedRows = enrichedTeam
    .map((profile) => {
      const user = userMap.get(profile.assigneeId);
      return {
        ...profile,
        assigneeName: user?.name ?? "Unknown",
        assigneeEmail: user?.email ?? "",
      };
    })
    .sort((a, b) => b.profitProgress - a.profitProgress);

  const agentRankings = rankedRows.slice(0, limit).map((profile, index) => ({
    rank: index + 1,
    _id: profile._id,
    assigneeId: profile.assigneeId,
    assigneeName: profile.assigneeName,
    assigneeEmail: profile.assigneeEmail,
    currency: profile.currency,
    profitTarget: profile.profitTarget,
    profitAchieved: profile.profitAchieved,
    profitProgress: profile.profitProgress,
    riskScore: profile.riskScore,
    incentiveTier: profile.incentiveTier,
  }));

  // Agents are funded in the supervisor's currency, so a month's profit adds up.
  const monthlyTeamTrend = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthRows = enrichedTeam
      .map((profile) => profile.monthlyAchievements.find((item) => item.month === month))
      .filter(Boolean);
    return {
      month,
      profitTarget: round2(monthRows.reduce((sum, item) => sum + (item?.profitTarget ?? 0), 0)),
      profitAchieved: round2(monthRows.reduce((sum, item) => sum + (item?.profitAchieved ?? 0), 0)),
    };
  });

  const avgProgress = enrichedTeam.length > 0
    ? Math.round(enrichedTeam.reduce((sum, profile) => sum + profile.profitProgress, 0) / enrichedTeam.length)
    : 0;

  return NextResponse.json({
    ownKpi,
    teamSummary: {
      totalAgents: enrichedTeam.length,
      avgProgress,
      highRiskCount: enrichedTeam.filter((profile) => profile.riskScore === "high").length,
      onTrackCount: enrichedTeam.filter((profile) => profile.riskScore === "low").length,
      incentiveBreakdown: {
        bronze: enrichedTeam.filter((profile) => profile.incentiveTier === "bronze").length,
        silver: enrichedTeam.filter((profile) => profile.incentiveTier === "silver").length,
        gold: enrichedTeam.filter((profile) => profile.incentiveTier === "gold").length,
        platinum: enrichedTeam.filter((profile) => profile.incentiveTier === "platinum").length,
      },
    },
    agentRankings,
    monthlyTeamTrend,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
