import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import { enrichProfile, enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/agent/target-profiles — agent's own target + leaderboard */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const view = searchParams.get("view") ?? "own"; // "own" | "leaderboard"

  if (view === "own") {
    const profile = await TargetProfile.findOne({
      ...PROFIT_TARGET_FILTER,
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
      ? { profit: Math.ceil(Math.max(0, monthlyTarget.profitTarget - monthlyTarget.profitAchieved) / remainingDays) }
      : null;

    const weeklyGoals = dailyGoals ? { profit: dailyGoals.profit * 5 } : null;

    return NextResponse.json({
      profile: enriched,
      currentMonth: monthlyTarget ?? null,
      dailyGoals,
      weeklyGoals,
    });
  }

  // Leaderboard — agents in the same distributed target group only. It ranks
  // by progress against each agent's own target, so it motivates without
  // exposing anyone's profit amounts, targets or reports.
  if (view === "leaderboard") {
    const ownProfile = await TargetProfile.findOne({
      ...PROFIT_TARGET_FILTER,
      assigneeId: ctx.userId,
      year,
      assigneeRole: "agent",
      status: "active",
    }).lean();

    if (!ownProfile) {
      return NextResponse.json({ leaderboard: [], myRank: null, totalParticipants: 0 });
    }

    const allAgentProfiles = await TargetProfile.find({
      ...PROFIT_TARGET_FILTER,
      year,
      assigneeRole: "agent",
      status: "active",
      ...(ownProfile.parentProfileId
        ? { parentProfileId: ownProfile.parentProfileId }
        : { _id: ownProfile._id }),
    }).lean();

    const userIds = [...new Set(allAgentProfiles.map((p) => String(p.assigneeId)))];
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id name")
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const enriched = await enrichProfiles(allAgentProfiles as unknown as Record<string, unknown>[]);
    const ranked = enriched
      .map((p) => ({
        assigneeId: p.assigneeId,
        assigneeName: userMap.get(p.assigneeId)?.name ?? "Unknown",
        profitProgress: p.profitProgress,
        incentiveTier: p.incentiveTier,
      }))
      .sort((a, b) => b.profitProgress - a.profitProgress || a.assigneeName.localeCompare(b.assigneeName))
      .map((r, i) => ({ ...r, rank: i + 1, isMe: r.assigneeId === ctx.userId }));

    const myRank = ranked.find((r) => r.isMe);

    return NextResponse.json({
      leaderboard: ranked.slice(0, 20),
      myRank: myRank ?? null,
      totalParticipants: ranked.length,
    });
  }

  return NextResponse.json({ error: "Invalid view parameter" }, { status: 400 });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
