/** Shape of `GET /api/admin/target-report`. */

export interface Progress {
  target: number;
  achieved: number;
}

export interface MoneyProgress extends Progress {
  currency: string;
}

/** The dashboard's own pace (`targetPace`): achieved, on pace, or behind. */
export type Pace = "achieved" | "onPace" | "behind";

export interface TargetPerson {
  /** The target profile id — its page is /admin/target-management/{id}. */
  id: string;
  name: string;
  email: string;
  role: "agent" | "super_agent";
  region: string | null;
  employers: Progress;
  employees: Progress;
  finance: MoneyProgress;
  /** Average of the three categories that have a target, in percent. */
  progress: number;
  pace: Pace;
}

export interface TargetMonth {
  /** ISO year-month, e.g. "2027-03". */
  month: string;
  employers: Progress;
  employees: Progress;
  /** In the main currency only. */
  finance: Progress;
}

export interface TargetReport {
  year: number;
  /** Years with active targets, plus the current and the requested one. */
  years: number[];
  /** Share of the year's target expected by now: 100 for a past year, 0 for a future one. */
  expectedProgress: number;
  totals: {
    employers: Progress;
    employees: Progress;
    finance: { currency: string | null; target: number; achieved: number; others: MoneyProgress[] };
    people: { total: number; achieved: number; onPace: number; behind: number };
  };
  monthly: TargetMonth[];
  people: TargetPerson[];
}

export type TargetMetric = "employers" | "employees" | "finance";

/** Whole-number share of a target; null when no target is set. */
export function percentOf(progress: Progress): number | null {
  return progress.target > 0 ? Math.round((progress.achieved / progress.target) * 100) : null;
}

/* Status never by colour alone: each chip carries its word. */
export const PACE_CHIP: Record<Pace, string> = {
  achieved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  onPace: "border-sky-200 bg-sky-50 text-sky-700",
  behind: "border-rose-200 bg-rose-50 text-rose-700",
};

export const PACE_LABEL_KEYS: Record<Pace, string> = {
  achieved: "paceAchieved",
  onPace: "paceOnPace",
  behind: "paceBehind",
};
