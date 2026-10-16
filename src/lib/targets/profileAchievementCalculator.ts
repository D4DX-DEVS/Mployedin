/**
 * Achievement calculator for the profit TargetProfile module.
 * A target has one aim, company profit; the numbers behind it (revenue,
 * commission cost, invoices, placements, employers) are drivers shown next to
 * it, never targets. How profit is measured and attributed lives in
 * ./profitCalculator.
 */

import {
  expectedProgress as scheduleExpectedProgress,
  fromStoredPeriods,
  monthlyTargets as scheduleMonthlyTargets,
  periodStatus,
  utcToday,
  type PeriodStatus,
  type PeriodType,
  type SchedulePeriod,
} from "./schedule";
import {
  calculateProfits,
  profitOwnerKey,
  type OwnerProfit,
  type ProfitMonth,
  type ProfitSource,
  type ProfitDrivers,
} from "./profitCalculator";

/** A profile without a currency predates the field; the schema default is AED. */
const DEFAULT_TARGET_CURRENCY = "AED";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type IncentiveTier = "none" | "bronze" | "silver" | "gold" | "platinum";

export interface MonthlyAchievement extends ProfitMonth {
  profitTarget: number;
  profitAchieved: number;
  profitProgress: number;
}

/** One period of a profile's schedule with the profit made inside it. */
export interface EnrichedPeriod extends SchedulePeriod {
  profitAchieved: number;
  profitProgress: number;
  status: PeriodStatus;
}

export interface EnrichedProfile {
  // Spread from ITargetProfile (lean)
  _id: string;
  assigneeId: string;
  assigneeRole: string;
  assignedBy: string;
  year: number;
  region?: string;
  profitTarget: number;
  currency: string;
  distributionStrategy: string;
  periodType: PeriodType;
  /** The schedule: the yearly target cut into periods, each with its own profit so far. */
  periods: EnrichedPeriod[];
  parentProfileId?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;

  // Enriched
  profitAchieved: number;
  profitProgress: number;
  profitPending: number;
  /** Share of the target that should be done by now, by the profile's own schedule. */
  expectedProgress: number;
  riskScore: "high" | "medium" | "low";
  incentiveTier: IncentiveTier;
  /** Read-only numbers behind the profit, for the same year. */
  drivers: ProfitDrivers;
  /** Profit by invoice category, largest first. */
  byCategory: OwnerProfit["byCategory"];
  /** All twelve months: target, profit achieved and drivers. */
  monthlyAchievements: MonthlyAchievement[];
}

/* ------------------------------------------------------------------ */
/*  Progress, pace, risk and tier                                      */
/* ------------------------------------------------------------------ */

/** Progress of `achieved` against `target`, capped at 999 so one outlier cannot dominate a chart. */
export function pct(achieved: number, target: number): number {
  return target > 0 ? Math.min(Math.round((achieved / target) * 100), 999) : 0;
}

/**
 * Share of a year's target that should be done by `now`: all of a past year,
 * none of a future one, and the months elapsed of the current one. Measuring
 * every year against today's month marked a whole 2027 plan "high risk" in
 * September 2026.
 */
export function expectedProgressPct(year: number, now: Date = new Date()): number {
  const currentYear = now.getFullYear();
  if (year < currentYear) return 100;
  if (year > currentYear) return 0;
  return Math.round(((now.getMonth() + 1) / 12) * 100);
}

/**
 * More than 20 points under the expected share is high risk, more than 10
 * medium. `expectedOverride` is the share a profile's own schedule expects;
 * without it the share of the year gone by is used.
 */
export function getRiskScore(
  progress: number,
  year: number,
  now: Date = new Date(),
  expectedOverride?: number,
): "high" | "medium" | "low" {
  const expected = expectedOverride ?? expectedProgressPct(year, now);
  if (progress < expected - 20) return "high";
  if (progress < expected - 10) return "medium";
  return "low";
}

export function getIncentiveTier(progress: number): IncentiveTier {
  if (progress >= 100) return "platinum";
  if (progress >= 80) return "gold";
  if (progress >= 60) return "silver";
  if (progress >= 40) return "bronze";
  return "none";
}

/* ------------------------------------------------------------------ */
/*  Monthly achievements                                               */
/* ------------------------------------------------------------------ */

/** The twelve months against what the schedule carries for each, whatever its period type. */
function monthlyAchievements(profit: OwnerProfit, monthTargets: number[]): MonthlyAchievement[] {
  return profit.months.map((month) => {
    const profitTarget = monthTargets[month.month - 1] ?? 0;
    return {
      ...month,
      profitTarget,
      profitAchieved: month.profit,
      profitProgress: pct(month.profit, profitTarget),
    };
  });
}

/**
 * Monthly profit for one person against the given monthly targets. Only the
 * months present in `monthlyTargets` are returned, so a caller can ask for the
 * current month alone.
 */
export async function calculateMonthlyAchievements(
  userId: string,
  role: "agent" | "super_agent",
  year: number,
  monthlyTargets: { month: number; profitTarget: number }[],
  currency: string = DEFAULT_TARGET_CURRENCY,
): Promise<MonthlyAchievement[]> {
  const profits = await calculateProfits([{ userId, role, currency }], year);
  const profit = profits.get(profitOwnerKey(role, userId));
  if (!profit) return [];
  const wanted = new Set(monthlyTargets.map((mt) => mt.month));
  const targets = new Array<number>(12).fill(0);
  for (const mt of monthlyTargets) targets[mt.month - 1] = mt.profitTarget ?? 0;
  return monthlyAchievements(profit, targets).filter((m) => wanted.has(m.month));
}

/* ------------------------------------------------------------------ */
/*  Enrich profiles                                                    */
/* ------------------------------------------------------------------ */

function toEnriched(profile: Record<string, unknown>, profit: OwnerProfit, now: Date): EnrichedProfile {
  const year = profile.year as number;
  const schedule = fromStoredPeriods(profile.periods as Parameters<typeof fromStoredPeriods>[0]);
  const today = utcToday(now);
  const profitTarget = (profile.profitTarget as number | undefined) ?? 0;
  const profitAchieved = profit.totals.profit;
  const profitProgress = pct(profitAchieved, profitTarget);
  const expected = scheduleExpectedProgress(schedule, year, now);

  return {
    _id: String(profile._id),
    assigneeId: String(profile.assigneeId),
    assigneeRole: profile.assigneeRole as string,
    assignedBy: String(profile.assignedBy),
    year,
    region: profile.region as string | undefined,
    profitTarget,
    currency: (profile.currency as string | undefined) ?? DEFAULT_TARGET_CURRENCY,
    distributionStrategy: (profile.distributionStrategy as string) ?? "equal",
    periodType: ((profile.periodType as PeriodType | undefined) ?? "monthly"),
    periods: schedule.map((period, i) => {
      const achieved = profit.periods[i]?.profit ?? 0;
      return {
        ...period,
        profitAchieved: achieved,
        profitProgress: pct(achieved, period.profitTarget),
        status: periodStatus(period, today),
      };
    }),
    parentProfileId: profile.parentProfileId ? String(profile.parentProfileId) : undefined,
    notes: profile.notes as string | undefined,
    status: (profile.status as string) ?? "active",
    createdAt: String(profile.createdAt),
    updatedAt: String(profile.updatedAt),

    profitAchieved,
    profitProgress,
    profitPending: Math.max(0, Math.round((profitTarget - profitAchieved) * 100) / 100),
    expectedProgress: expected,
    riskScore: getRiskScore(profitProgress, year, now, expected),
    incentiveTier: getIncentiveTier(profitProgress),
    drivers: profit.totals,
    byCategory: profit.byCategory,
    monthlyAchievements: monthlyAchievements(profit, scheduleMonthlyTargets(schedule)),
  };
}

/**
 * Enrich profiles with their profit achievement, risk and tier. Profiles are
 * grouped by year and each year costs a fixed number of queries, whatever the
 * mix of super agents and agents.
 */
export async function enrichProfiles(profiles: Record<string, unknown>[]): Promise<EnrichedProfile[]> {
  if (profiles.length === 0) return [];

  const years = [...new Set(profiles.map((p) => p.year as number))];
  const profitByYear = new Map<number, Map<string, OwnerProfit>>();
  await Promise.all(
    years.map(async (year) => {
      const sources: ProfitSource[] = profiles
        .filter((p) => p.year === year)
        .map((p) => ({
          userId: String(p.assigneeId),
          role: p.assigneeRole as "agent" | "super_agent",
          currency: (p.currency as string | undefined) ?? DEFAULT_TARGET_CURRENCY,
          periods: fromStoredPeriods(p.periods as Parameters<typeof fromStoredPeriods>[0]),
        }));
      profitByYear.set(year, await calculateProfits(sources, year));
    }),
  );

  const now = new Date();
  return profiles.map((profile) => {
    const role = profile.assigneeRole as "agent" | "super_agent";
    const profit = profitByYear.get(profile.year as number)?.get(profitOwnerKey(role, String(profile.assigneeId)));
    return toEnriched(profile, profit ?? emptyProfit(), now);
  });
}

export async function enrichProfile(profile: Record<string, unknown>): Promise<EnrichedProfile> {
  const [enriched] = await enrichProfiles([profile]);
  return enriched;
}

function emptyProfit(): OwnerProfit {
  return {
    months: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      profit: 0,
      revenue: 0,
      commissionCost: 0,
      invoicesPaid: 0,
      placements: 0,
      newEmployers: 0,
    })),
    periods: [],
    totals: { profit: 0, revenue: 0, commissionCost: 0, invoicesPaid: 0, placements: 0, newEmployers: 0 },
    byCategory: [],
  };
}
