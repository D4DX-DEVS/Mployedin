import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Target from "@/models/Target";
import SuperAgent from "@/models/SuperAgent";
import { enrichTargetWithAchievement } from "@/lib/targets/achievementCalculator";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

/**
 * GET /api/admin/targets/grouped?year=2026
 * Enterprise grouped view — one row per Super Agent with:
 *   team size, all 3 target types, monthly distribution status,
 *   achieved/pending totals, performance %, risk score.
 */
async function handler(req: NextRequest, _ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const status = searchParams.get("status") ?? "active";

  // Fetch all yearly targets for the year
  const query: Record<string, unknown> = {
    year,
    month: { $exists: false },
  };
  if (status && status !== "all") query.status = status;

  const targets = await Target.find(query).sort({ type: 1 }).lean();

  // Resolve assignee info
  const assigneeIds = [...new Set(targets.map((t) => String(t.assigneeId)))];
  const users = await User.find({ _id: { $in: assigneeIds } })
    .select("_id name email role")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Get SuperAgent docs for team sizes
  const superAgentDocs = await SuperAgent.find({ userId: { $in: assigneeIds } })
    .select("userId agentIds")
    .lean();
  const teamSizeMap = new Map(
    superAgentDocs.map((sa) => [String(sa.userId), (sa.agentIds ?? []).length])
  );

  // Count monthly targets per parent for distribution status
  const yearlyTargetIds = targets.map((t) => t._id);
  const monthlyTargets = await Target.aggregate([
    { $match: { parentTargetId: { $in: yearlyTargetIds }, status: "active" } },
    { $group: { _id: "$parentTargetId", monthCount: { $sum: 1 } } },
  ]);
  const monthlyCountMap = new Map(
    monthlyTargets.map((m) => [String(m._id), m.monthCount as number])
  );

  // Enrich with achievement data
  const enriched = await Promise.all(
    targets.map((t) => enrichTargetWithAchievement(t))
  );

  // Group by assigneeId
  interface TargetCellData {
    _id: string;
    targetValue: number;
    achieved: number;
    progress: number;
    status: string;
    currency?: string;
    monthlyDistributed: number; // how many months distributed (0-12)
  }

  const grouped: Record<string, {
    assigneeId: string;
    assigneeName: string;
    assigneeEmail: string;
    assigneeRole: string;
    teamSize: number;
    employer: TargetCellData | null;
    employee: TargetCellData | null;
    finance: TargetCellData | null;
  }> = {};

  for (const t of enriched) {
    const aid = String(t.assigneeId);
    if (!grouped[aid]) {
      const user = userMap.get(aid);
      grouped[aid] = {
        assigneeId: aid,
        assigneeName: user?.name ?? "Unknown",
        assigneeEmail: user?.email ?? "",
        assigneeRole: t.assigneeRole,
        teamSize: teamSizeMap.get(aid) ?? 0,
        employer: null,
        employee: null,
        finance: null,
      };
    }
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

  // Compute per-row aggregate metrics
  const rows = Object.values(grouped).map((row) => {
    const cells = [row.employer, row.employee, row.finance].filter(Boolean) as TargetCellData[];
    const totalAchieved = (row.employer?.achieved ?? 0) + (row.employee?.achieved ?? 0);
    const totalTarget = (row.employer?.targetValue ?? 0) + (row.employee?.targetValue ?? 0);
    const performancePct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
    const pending = totalTarget - totalAchieved;
    const currentMonth = new Date().getMonth() + 1;
    const expectedPct = Math.round((currentMonth / 12) * 100);
    // Risk: high if behind schedule by >20%, medium if >10%, low otherwise
    const riskScore = performancePct < expectedPct - 20 ? "high" : performancePct < expectedPct - 10 ? "medium" : "low";
    const distributedCount = cells.reduce((s, c) => s + c.monthlyDistributed, 0);
    const totalCells = cells.length;

    return {
      ...row,
      performancePct,
      pending,
      riskScore,
      distributionStatus: totalCells > 0
        ? distributedCount >= totalCells * 12 ? "full" : distributedCount > 0 ? "partial" : "none"
        : "none",
    };
  });

  const totalTargets = enriched.length;

  return NextResponse.json({
    rows,
    totals: {
      totalTargets,
      supervisors: rows.length,
      totalTeamSize: rows.reduce((s, r) => s + r.teamSize, 0),
      employer: {
        target: rows.reduce((s, r) => s + (r.employer?.targetValue ?? 0), 0),
        achieved: rows.reduce((s, r) => s + (r.employer?.achieved ?? 0), 0),
      },
      employee: {
        target: rows.reduce((s, r) => s + (r.employee?.targetValue ?? 0), 0),
        achieved: rows.reduce((s, r) => s + (r.employee?.achieved ?? 0), 0),
      },
      finance: {
        target: rows.reduce((s, r) => s + (r.finance?.targetValue ?? 0), 0),
        achieved: rows.reduce((s, r) => s + (r.finance?.achieved ?? 0), 0),
      },
      avgPerformance: rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + r.performancePct, 0) / rows.length)
        : 0,
      riskBreakdown: {
        high: rows.filter((r) => r.riskScore === "high").length,
        medium: rows.filter((r) => r.riskScore === "medium").length,
        low: rows.filter((r) => r.riskScore === "low").length,
      },
    },
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
