import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Target from "@/models/Target";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { enrichTargetWithAchievement } from "@/lib/targets/achievementCalculator";

interface AuthCtx { userId: string; role: string; locale: string; }

/**
 * GET /api/super-agent/targets/grouped?year=2026
 * Enterprise grouped view — one row per Agent with:
 *   all 3 target types, achieved/pending, completion %, risk level.
 */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const status = searchParams.get("status") ?? "active";

  // Find agent user IDs under this super-agent
  const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  if (!sa) return NextResponse.json({ error: "SuperAgent profile not found" }, { status: 404 });

  const agentDocs = await Agent.find({ _id: { $in: sa.agentIds ?? [] } })
    .select("userId")
    .lean();
  const agentUserIds = agentDocs.map((a) => String(a.userId));

  if (agentUserIds.length === 0) {
    return NextResponse.json({
      rows: [],
      totals: { totalTargets: 0, agents: 0, employer: { target: 0, achieved: 0 }, employee: { target: 0, achieved: 0 }, finance: { target: 0, achieved: 0 }, avgPerformance: 0, riskBreakdown: { high: 0, medium: 0, low: 0 } },
    });
  }

  // Fetch yearly targets for these agents
  const query: Record<string, unknown> = {
    assigneeId: { $in: agentUserIds },
    assigneeRole: "agent",
    year,
    month: { $exists: false },
  };
  if (status && status !== "all") query.status = status;

  const targets = await Target.find(query).sort({ type: 1 }).lean();

  // Count monthly distributions per parent target
  const yearlyIds = targets.map((t) => t._id);
  const monthlyAgg = await Target.aggregate([
    { $match: { parentTargetId: { $in: yearlyIds }, status: "active" } },
    { $group: { _id: "$parentTargetId", monthCount: { $sum: 1 } } },
  ]);
  const monthlyCountMap = new Map(
    monthlyAgg.map((m) => [String(m._id), m.monthCount as number])
  );

  // Resolve user info
  const users = await User.find({ _id: { $in: agentUserIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Enrich with achievement
  const enriched = await Promise.all(
    targets.map((t) => enrichTargetWithAchievement(t))
  );

  // Group by assigneeId
  interface CellData {
    _id: string;
    targetValue: number;
    achieved: number;
    progress: number;
    status: string;
    currency?: string;
    monthlyDistributed: number;
  }

  const grouped: Record<string, {
    assigneeId: string;
    assigneeName: string;
    assigneeEmail: string;
    assigneeRole: string;
    employer: CellData | null;
    employee: CellData | null;
    finance: CellData | null;
  }> = {};

  // Pre-populate all agents (even those without targets)
  for (const uid of agentUserIds) {
    const user = userMap.get(uid);
    grouped[uid] = {
      assigneeId: uid,
      assigneeName: user?.name ?? "Unknown",
      assigneeEmail: user?.email ?? "",
      assigneeRole: "agent",
      employer: null,
      employee: null,
      finance: null,
    };
  }

  for (const t of enriched) {
    const aid = String(t.assigneeId);
    if (!grouped[aid]) continue;
    grouped[aid][t.type as "employer" | "employee" | "finance"] = {
      _id: String(t._id),
      targetValue: t.targetValue,
      achieved: (t as Record<string, unknown>).achieved as number ?? 0,
      progress: (t as Record<string, unknown>).progress as number ?? 0,
      status: t.status,
      monthlyDistributed: monthlyCountMap.get(String(t._id)) ?? 0,
      ...(t.type === "finance" ? { currency: t.currency ?? "AED" } : {}),
    };
  }

  // Compute per-row metrics
  const currentMonth = new Date().getMonth() + 1;
  const expectedPct = Math.round((currentMonth / 12) * 100);

  const rows = Object.values(grouped).map((row) => {
    const totalAchieved = (row.employer?.achieved ?? 0) + (row.employee?.achieved ?? 0);
    const totalTarget = (row.employer?.targetValue ?? 0) + (row.employee?.targetValue ?? 0);
    const completionPct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
    const pending = totalTarget - totalAchieved;
    const riskLevel = completionPct < expectedPct - 20 ? "high" : completionPct < expectedPct - 10 ? "medium" : "low";

    return { ...row, completionPct, pending, riskLevel };
  });

  const totalTargets = enriched.length;

  return NextResponse.json({
    rows,
    totals: {
      totalTargets,
      agents: rows.length,
      employer: { target: rows.reduce((s, r) => s + (r.employer?.targetValue ?? 0), 0), achieved: rows.reduce((s, r) => s + (r.employer?.achieved ?? 0), 0) },
      employee: { target: rows.reduce((s, r) => s + (r.employee?.targetValue ?? 0), 0), achieved: rows.reduce((s, r) => s + (r.employee?.achieved ?? 0), 0) },
      finance: { target: rows.reduce((s, r) => s + (r.finance?.targetValue ?? 0), 0), achieved: rows.reduce((s, r) => s + (r.finance?.achieved ?? 0), 0) },
      avgPerformance: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.completionPct, 0) / rows.length) : 0,
      riskBreakdown: {
        high: rows.filter((r) => r.riskLevel === "high").length,
        medium: rows.filter((r) => r.riskLevel === "medium").length,
        low: rows.filter((r) => r.riskLevel === "low").length,
      },
    },
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
