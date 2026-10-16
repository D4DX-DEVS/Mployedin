/** Shape of `GET /api/admin/target-report`. */

import type { Pace } from "@/components/features/targets/pace";
import type { TargetInsights } from "@/lib/targets/insights";
import type { ReportCategory, ReportPeriod } from "@/lib/targets/profitReport";
import type { PeriodType } from "@/lib/targets/schedule";

export { PACE_CHIP, PACE_LABEL_KEYS, type Pace } from "@/components/features/targets/pace";

export interface MoneyProgress {
  currency: string;
  target: number;
  achieved: number;
}

export interface TargetPerson {
  /** The target profile id — its page is /admin/target-management/{id}. */
  id: string;
  userId: string;
  /** The super agent's profile this agent's target came from, when it has one. */
  parentProfileId: string | null;
  name: string;
  email: string;
  role: "agent" | "super_agent";
  region: string | null;
  currency: string;
  profitTarget: number;
  profitAchieved: number;
  /** Profit achieved against the target, in percent. */
  progress: number;
  /** Behind pace, on pace or achieved, by the target's own schedule. */
  pace: Pace;
  /** Share of the target the schedule expects to be done by now. */
  expectedProgress: number;
  incentiveTier: "none" | "bronze" | "silver" | "gold" | "platinum";
  periodType: PeriodType;
  /** Each period of the schedule with the profit made in it. */
  periods: ReportPeriod[];
  /** Completion status, growth, forecast and time left. */
  insights: TargetInsights;
}

export interface TargetMonth {
  /** ISO year-month, e.g. "2027-03". */
  month: string;
  /** In the main currency only. */
  target: number;
  achieved: number;
}

export interface TargetReport {
  year: number;
  /** Years with active targets, plus the current and the requested one. */
  years: number[];
  /** Share of the year's target expected by now: 100 for a past year, 0 for a future one. */
  expectedProgress: number;
  totals: {
    /** The main currency leads; the others are listed and never added in. */
    profit: { currency: string | null; target: number; achieved: number; others: MoneyProgress[] };
    drivers: { revenue: number; commissionCost: number; invoicesPaid: number; placements: number; newEmployers: number };
    people: { total: number; achieved: number; onPace: number; behind: number; notStarted: number };
  };
  monthly: TargetMonth[];
  byCategory: ReportCategory[];
  people: TargetPerson[];
}

/** Whole-number share of a target; null when no target is set. */
export function percentOf(achieved: number, target: number): number | null {
  return target > 0 ? Math.round((achieved / target) * 100) : null;
}
