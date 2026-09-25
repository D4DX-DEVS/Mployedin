/**
 * The admin dashboard's reporting window. Lives in the URL (`?period=7d`) so a
 * refresh, back/forward or a shared link reproduces the same numbers.
 */

export const DASHBOARD_PERIODS = ["7d", "30d", "90d"] as const;

export type DashboardPeriodKey = (typeof DASHBOARD_PERIODS)[number];

export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriodKey = "30d";

export interface DashboardPeriod {
  key: DashboardPeriodKey;
  days: number;
  now: Date;
  /** Start of the current window. */
  start: Date;
  /** Start of the equally long window before it, for "vs previous" deltas. */
  previousStart: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isDashboardPeriod(value: unknown): value is DashboardPeriodKey {
  return typeof value === "string" && (DASHBOARD_PERIODS as readonly string[]).includes(value);
}

/** Anything outside the allowed keys (an old link, a hand-edited URL) falls back to 30 days. */
export function resolveDashboardPeriod(value: unknown, now: Date = new Date()): DashboardPeriod {
  const key = isDashboardPeriod(value) ? value : DEFAULT_DASHBOARD_PERIOD;
  const days = Number.parseInt(key, 10);
  return {
    key,
    days,
    now,
    start: new Date(now.getTime() - days * DAY_MS),
    previousStart: new Date(now.getTime() - 2 * days * DAY_MS),
  };
}

/** Whole-number percentage change; null when there is no previous figure to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Smallest previous-period figure a percentage is shown against. Below it a
 * percentage exaggerates: 1 application then and 42 now reads "Up 4100%".
 */
export const MIN_PERCENT_BASELINE = 10;

export type PeriodChange =
  /** Zero in both periods. */
  | { kind: "none" }
  /** None in the previous period, some in this one. */
  | { kind: "new" }
  /** Signed difference, for a previous period under `MIN_PERCENT_BASELINE`. */
  | { kind: "count"; value: number }
  /** Signed whole-number percentage. */
  | { kind: "percent"; value: number };

/** How this period compares with the one before, in the form that reads honestly. */
export function periodChange(current: number, previous: number): PeriodChange {
  if (previous === 0) return current === 0 ? { kind: "none" } : { kind: "new" };
  if (previous < MIN_PERCENT_BASELINE) return { kind: "count", value: current - previous };
  return { kind: "percent", value: percentChange(current, previous) ?? 0 };
}
