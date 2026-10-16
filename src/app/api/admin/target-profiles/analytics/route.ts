import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import { enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import { profitTotals } from "@/lib/targets/profitTotals";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

const round2 = (value: number) => Math.round(value * 100) / 100;

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/target-profiles/analytics                          */
/*  Leaderboard, region comparison and underperformers for the admin   */
/*  target page.                                                       */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const assigneeRole = searchParams.get("assigneeRole") ?? "super_agent";

  const query: Record<string, unknown> = {
    ...PROFIT_TARGET_FILTER,
    year,
    status: "active",
  };

  if (["super_agent", "agent"].includes(assigneeRole)) {
    query.assigneeRole = assigneeRole;
  }

  const profiles = await TargetProfile.find(query).lean();

  if (profiles.length === 0) {
    return NextResponse.json({
      leaderboard: [],
      regionComparison: [],
      underperformers: [],
      topPerformers: [],
    });
  }

  // Resolve names
  const userIds = [...new Set(profiles.map((p) => String(p.assigneeId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const enriched = await enrichProfiles(profiles as unknown as Record<string, unknown>[]);
  const rows = enriched.map((p) => {
    const user = userMap.get(p.assigneeId);
    return { ...p, assigneeName: user?.name ?? "Unknown", assigneeEmail: user?.email ?? "" };
  });

  // Leaderboard — sorted by profit progress descending
  const leaderboard = [...rows]
    .sort((a, b) => b.profitProgress - a.profitProgress)
    .map((r, i) => ({
      rank: i + 1,
      _id: r._id,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      profitProgress: r.profitProgress,
      riskScore: r.riskScore,
    }));

  // Region comparison — profit per currency, never added across currencies
  const regionMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const region = r.region || "Unassigned";
    if (!regionMap.has(region)) regionMap.set(region, []);
    regionMap.get(region)!.push(r);
  }

  const regionComparison = Array.from(regionMap.entries()).map(([region, rRows]) => ({
    region,
    supervisors: rRows.length,
    avgProgress: Math.round(rRows.reduce((s, r) => s + r.profitProgress, 0) / rRows.length),
    profit: profitTotals(rRows),
    highRisk: rRows.filter((r) => r.riskScore === "high").length,
  }));

  // Underperformers — below half of the pace the profile's own schedule expects by now.
  // Against the plan's own schedule: today's month made every 2027 plan an underperformer.
  const underperformers = rows
    .filter((r) => r.profitProgress < r.expectedProgress * 0.5)
    .sort((a, b) => a.profitProgress - b.profitProgress)
    .slice(0, 10)
    .map((r) => ({
      _id: r._id,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      profitProgress: r.profitProgress,
      expectedProgress: r.expectedProgress,
      gap: r.expectedProgress - r.profitProgress,
      riskScore: r.riskScore,
      incentiveTier: r.incentiveTier,
    }));

  // Top performers
  const topPerformers = [...rows]
    .sort((a, b) => b.profitProgress - a.profitProgress)
    .slice(0, 5)
    .map((r) => ({
      _id: r._id,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      profitProgress: r.profitProgress,
      profitAchieved: round2(r.profitAchieved),
      currency: r.currency,
    }));

  return NextResponse.json({
    leaderboard,
    regionComparison,
    underperformers,
    topPerformers,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
