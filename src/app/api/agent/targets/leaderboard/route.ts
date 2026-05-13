import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Target from "@/models/Target";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { enrichTargetWithAchievement } from "@/lib/targets/achievementCalculator";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/agent/targets/leaderboard                               */
/*  Returns ranking among peer agents (same super-agent team)          */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  // Find the super-agent who manages this agent
  const agentDoc = await Agent.findOne({ userId: ctx.userId }).lean();
  if (!agentDoc) {
    return NextResponse.json({ leaderboard: [], myRank: 0, totalAgents: 0 });
  }

  // Find super-agent that has this agent
  const superAgent = await SuperAgent.findOne({ agentIds: ctx.userId }).lean();
  const peerIds: string[] = superAgent
    ? (superAgent as { agentIds?: string[] }).agentIds ?? []
    : [ctx.userId];

  // Get all yearly targets for these agents
  const allTargets = await Target.find({
    assigneeId: { $in: peerIds },
    assigneeRole: "agent",
    year,
    month: { $exists: false },
    status: { $ne: "cancelled" },
  }).lean();

  const enriched = await Promise.all(allTargets.map((t) => enrichTargetWithAchievement(t)));

  // Group by agent and compute avg performance
  const agentScores: Record<string, { total: number; count: number }> = {};
  for (const id of peerIds) {
    agentScores[id] = { total: 0, count: 0 };
  }
  for (const t of enriched) {
    const id = String(t.assigneeId);
    if (agentScores[id]) {
      agentScores[id].total += (t as { progress?: number }).progress ?? 0;
      agentScores[id].count += 1;
    }
  }

  // Fetch user names
  const users = await User.find({ _id: { $in: peerIds } }).select("name email").lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Build leaderboard
  const leaderboard = peerIds
    .map((id) => {
      const user = userMap.get(id);
      const score = agentScores[id];
      const avgPct = score && score.count > 0 ? Math.round(score.total / score.count) : 0;
      return {
        agentId: id,
        name: (user as { name?: string })?.name ?? "Unknown",
        email: (user as { email?: string })?.email ?? "",
        avgPerformance: avgPct,
        targetsCount: score?.count ?? 0,
      };
    })
    .sort((a, b) => b.avgPerformance - a.avgPerformance);

  const myRank = leaderboard.findIndex((l) => l.agentId === ctx.userId) + 1;

  return NextResponse.json({
    leaderboard,
    myRank,
    totalAgents: leaderboard.length,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
