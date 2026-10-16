import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import User from "@/models/User";
import { enrichProfiles, expectedProgressPct } from "@/lib/targets/profileAchievementCalculator";
import { targetPace } from "@/lib/targets/pace";
import { profitTotals } from "@/lib/targets/profitTotals";
import { categoriesOf } from "@/lib/targets/profitReport";
import { loadPreviousYearProfits, loadTargetReport } from "@/lib/targets/loadReport";
import { targetInsights } from "@/lib/targets/insights";
import { defaultReportYear } from "@/lib/targets/reportYear";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: string; locale: string; }

/** The TargetProfile schema's own bounds. */
const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

const round2 = (value: number) => Math.round(value * 100) / 100;

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/target-report?year=                                */
/*  One year of profit targets against what was achieved: totals, the  */
/*  month by month line, where the profit came from, and every         */
/*  target's progress, completion status, growth and schedule. With no */
/*  year it opens on the one that has targets.                         */
/*                                                                     */
/*  GET  /api/admin/target-report?profileId=                           */
/*  The full report of one super agent (with their team) or agent.     */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const searchParams = new URL(req.url).searchParams;
  const profileId = searchParams.get("profileId");
  if (profileId) {
    if (!isValidObjectId(profileId)) return NextResponse.json({ error: "Invalid profile ID" }, { status: 400 });
    const profile = await TargetProfile.findOne({
      _id: profileId,
      ...PROFIT_TARGET_FILTER,
      status: { $ne: "cancelled" },
    }).lean();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    return NextResponse.json({ report: await loadTargetReport(profile, { includeTeam: true }) });
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const yearsWithTargets = (await TargetProfile.distinct("year", { ...PROFIT_TARGET_FILTER, status: "active" })) as number[];
  const requested = Number.parseInt(searchParams.get("year") ?? "", 10);
  const year = Number.isInteger(requested) && requested >= MIN_YEAR && requested <= MAX_YEAR
    ? requested
    : defaultReportYear(yearsWithTargets, currentYear);

  const profiles = await TargetProfile.find({ ...PROFIT_TARGET_FILTER, year, status: "active" }).lean();

  const [enriched, users] = await Promise.all([
    profiles.length > 0 ? enrichProfiles(profiles as unknown as Record<string, unknown>[]) : Promise.resolve([]),
    User.find({ _id: { $in: profiles.map((profile) => profile.assigneeId) } }).select("_id name email").lean(),
  ]);
  const previousProfit = enriched.length > 0 ? await loadPreviousYearProfits(enriched, year) : new Map<string, number>();
  const insightsOf = new Map(enriched.map((profile) => [profile._id, targetInsights(profile, previousProfit.get(profile._id) ?? 0, now)]));
  const userById = new Map(users.map((user) => [String(user._id), user]));

  /* Totals count each target once. A super agent's profit already covers their
     agents, so only top-level profiles add up — an agent whose parent plan is
     not active this year stands on its own. */
  const activeIds = new Set(enriched.map((profile) => profile._id));
  const topLevel = enriched.filter((profile) => !profile.parentProfileId || !activeIds.has(profile.parentProfileId));
  const profit = profitTotals(topLevel);
  const mainCurrency = profit.currency;
  // Money is never added across currencies, so the breakdowns follow the main one.
  const mainTopLevel = topLevel.filter((profile) => profile.currency === mainCurrency);

  // What the plans expect by now, weighted by size: each schedule has its own pace (a
  // weekly plan and an annual one are not at the same point on the same day).
  const targetSum = mainTopLevel.reduce((sum, profile) => sum + profile.profitTarget, 0);
  const expectedProgress = targetSum > 0
    ? Math.round(mainTopLevel.reduce((sum, profile) => sum + profile.expectedProgress * profile.profitTarget, 0) / targetSum)
    : expectedProgressPct(year, now);

  const pace = { achieved: 0, onPace: 0, behind: 0, notStarted: 0 };
  for (const profile of enriched) pace[insightsOf.get(profile._id)!.status] += 1;

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const point = { month: `${year}-${String(month).padStart(2, "0")}`, target: 0, achieved: 0 };
    for (const profile of mainTopLevel) {
      const row = profile.monthlyAchievements.find((entry) => entry.month === month);
      if (!row) continue;
      point.target += row.profitTarget;
      point.achieved += row.profitAchieved;
    }
    return { ...point, target: round2(point.target), achieved: round2(point.achieved) };
  });

  const drivers = mainTopLevel.reduce(
    (total, profile) => ({
      revenue: round2(total.revenue + profile.drivers.revenue),
      commissionCost: round2(total.commissionCost + profile.drivers.commissionCost),
      invoicesPaid: total.invoicesPaid + profile.drivers.invoicesPaid,
      placements: total.placements + profile.drivers.placements,
      newEmployers: total.newEmployers + profile.drivers.newEmployers,
    }),
    { revenue: 0, commissionCost: 0, invoicesPaid: 0, placements: 0, newEmployers: 0 },
  );

  const categoryProfit = new Map<string, number>();
  for (const profile of mainTopLevel) {
    for (const row of profile.byCategory) {
      categoryProfit.set(row.category, (categoryProfit.get(row.category) ?? 0) + row.profit);
    }
  }
  const byCategory = categoriesOf(
    [...categoryProfit.entries()]
      .map(([category, value]) => ({ category, profit: round2(value) }))
      .sort((left, right) => right.profit - left.profit),
  );

  const people = enriched
    .map((profile) => {
      const user = userById.get(profile.assigneeId);
      return {
        id: profile._id,
        userId: profile.assigneeId,
        parentProfileId: profile.parentProfileId ?? null,
        name: user?.name ?? "",
        email: user?.email ?? "",
        role: profile.assigneeRole as "agent" | "super_agent",
        region: profile.region ?? null,
        currency: profile.currency,
        profitTarget: profile.profitTarget,
        profitAchieved: profile.profitAchieved,
        progress: profile.profitProgress,
        pace: targetPace(profile),
        expectedProgress: profile.expectedProgress,
        incentiveTier: profile.incentiveTier,
        periodType: profile.periodType,
        periods: profile.periods,
        insights: insightsOf.get(profile._id)!,
      };
    })
    .sort((left, right) => right.progress - left.progress || left.name.localeCompare(right.name));

  return NextResponse.json({
    year,
    years: [...new Set([...yearsWithTargets, currentYear, year])].sort((left, right) => right - left),
    expectedProgress,
    totals: {
      profit,
      drivers,
      people: { total: enriched.length, ...pace },
    },
    monthly,
    byCategory,
    people,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
