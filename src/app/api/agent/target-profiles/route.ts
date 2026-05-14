import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { enrichProfile, enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/agent/target-profiles — agent's own targets + leaderboard*/
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const view = searchParams.get("view") ?? "own"; // "own" | "leaderboard"

  if (view === "own") {
    const profile = await TargetProfile.findOne({
      assigneeId: ctx.userId,
      year,
      assigneeRole: "agent",
      status: { $ne: "cancelled" },
    }).lean();

    if (!profile) {
      return NextResponse.json({ profile: null, message: "No target profile for this year" });
    }

    const enriched = await enrichProfile(profile as unknown as Record<string, unknown>);

    // Calculate daily/weekly goals
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const daysInMonth = new Date(year, currentMonth, 0).getDate();
    const dayOfMonth = now.getDate();
    const remainingDays = Math.max(daysInMonth - dayOfMonth + 1, 1);
    const monthlyTarget = enriched.monthlyAchievements.find((m) => m.month === currentMonth);

    const dailyGoals = monthlyTarget
      ? {
          employer: Math.ceil(Math.max(0, monthlyTarget.employerTarget - monthlyTarget.employerAchieved) / remainingDays),
          employee: Math.ceil(Math.max(0, monthlyTarget.employeeTarget - monthlyTarget.employeeAchieved) / remainingDays),
          finance: Math.ceil(Math.max(0, monthlyTarget.financeTarget - monthlyTarget.financeAchieved) / remainingDays),
        }
      : null;

    const weeklyGoals = dailyGoals
      ? {
          employer: dailyGoals.employer * 5,
          employee: dailyGoals.employee * 5,
          finance: dailyGoals.finance * 5,
        }
      : null;

    return NextResponse.json({
      profile: enriched,
      currentMonth: monthlyTarget ?? null,
      dailyGoals,
      weeklyGoals,
    });
  }

  // Leaderboard — agents in the same distributed target group only
  if (view === "leaderboard") {
    const ownProfile = await TargetProfile.findOne({
      assigneeId: ctx.userId,
      year,
      assigneeRole: "agent",
      status: "active",
    }).lean();

    if (!ownProfile) {
      return NextResponse.json({ leaderboard: [], myRank: null, totalParticipants: 0 });
    }

    const allAgentProfiles = await TargetProfile.find({
      year,
      assigneeRole: "agent",
      status: "active",
      ...(ownProfile.parentProfileId
        ? { parentProfileId: ownProfile.parentProfileId }
        : { _id: ownProfile._id }),
    }).lean();

    const userIds = [...new Set(allAgentProfiles.map((p) => String(p.assigneeId)))];
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id name email")
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const enriched = await enrichProfiles(allAgentProfiles as unknown as Record<string, unknown>[]);
    const ranked = enriched
      .map((p) => {
        const user = userMap.get(p.assigneeId);
        return {
          _id: p._id,
          assigneeId: p.assigneeId,
          assigneeName: user?.name ?? "Unknown",
          overallProgress: p.overallProgress,
          employerProgress: p.employerProgress,
          employeeProgress: p.employeeProgress,
          financeProgress: p.financeProgress,
          riskScore: p.riskScore,
          incentiveTier: p.incentiveTier,
        };
      })
      .sort((a, b) => b.overallProgress - a.overallProgress)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const myRank = ranked.find((r) => r.assigneeId === ctx.userId);

    return NextResponse.json({
      leaderboard: ranked.slice(0, 20),
      myRank: myRank ?? null,
      totalParticipants: ranked.length,
    });
  }

  return NextResponse.json({ error: "Invalid view parameter" }, { status: 400 });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
