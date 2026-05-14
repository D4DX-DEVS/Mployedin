import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import User from "@/models/User";
import { enrichProfile, enrichProfiles } from "@/lib/targets/profileAchievementCalculator";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));

  const ownProfile = await TargetProfile.findOne({
    assigneeId: ctx.userId,
    year,
    assigneeRole: "super_agent",
    status: { $ne: "cancelled" },
  }).lean();

  const teamQuery = ownProfile
    ? {
        year,
        assigneeRole: "agent",
        status: { $ne: "cancelled" },
        $or: [
          { parentProfileId: ownProfile._id },
          { assignedBy: ctx.userId },
        ],
      }
    : {
        year,
        assigneeRole: "agent",
        status: { $ne: "cancelled" },
        assignedBy: ctx.userId,
      };

  const agentProfiles = await TargetProfile.find(teamQuery).lean();
  const uniqueAgentProfiles = agentProfiles.filter(
    (profile, index, allProfiles) =>
      allProfiles.findIndex((candidate) => String(candidate.assigneeId) === String(profile.assigneeId)) === index
  );

  const [ownKpi, enrichedTeam] = await Promise.all([
    ownProfile ? enrichProfile(ownProfile as unknown as Record<string, unknown>) : Promise.resolve(null),
    enrichProfiles(uniqueAgentProfiles as unknown as Record<string, unknown>[]),
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
    .sort((a, b) => b.overallProgress - a.overallProgress);

  const agentRankings = rankedRows.slice(0, limit).map((profile, index) => ({
    rank: index + 1,
    _id: profile._id,
    assigneeId: profile.assigneeId,
    assigneeName: profile.assigneeName,
    assigneeEmail: profile.assigneeEmail,
    overallProgress: profile.overallProgress,
    employerProgress: profile.employerProgress,
    employeeProgress: profile.employeeProgress,
    financeProgress: profile.financeProgress,
    riskScore: profile.riskScore,
    incentiveTier: profile.incentiveTier,
  }));

  const monthlyTeamTrend = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthRows = enrichedTeam
      .map((profile) => profile.monthlyAchievements.find((item) => item.month === month))
      .filter(Boolean);
    const totalProgress = monthRows.reduce((sum, item) => sum + (item?.overallProgress ?? 0), 0);
    return {
      month,
      employerAchieved: monthRows.reduce((sum, item) => sum + (item?.employerAchieved ?? 0), 0),
      employeeAchieved: monthRows.reduce((sum, item) => sum + (item?.employeeAchieved ?? 0), 0),
      financeAchieved: monthRows.reduce((sum, item) => sum + (item?.financeAchieved ?? 0), 0),
      avgProgress: monthRows.length > 0 ? Math.round(totalProgress / monthRows.length) : 0,
    };
  });

  const avgPerformance = enrichedTeam.length > 0
    ? Math.round(enrichedTeam.reduce((sum, profile) => sum + profile.overallProgress, 0) / enrichedTeam.length)
    : 0;

  return NextResponse.json({
    ownKpi,
    teamSummary: {
      totalAgents: enrichedTeam.length,
      avgPerformance,
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