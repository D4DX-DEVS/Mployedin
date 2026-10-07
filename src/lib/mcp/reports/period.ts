import { periodChange, type DashboardPeriod, type PeriodChange } from "@/lib/admin/dashboard/period";

export interface ReportPeriod {
  key: DashboardPeriod["key"];
  days: number;
  from: string;
  to: string;
  comparedWith: { from: string; to: string };
}

export function describePeriod(period: DashboardPeriod): ReportPeriod {
  return {
    key: period.key,
    days: period.days,
    from: period.start.toISOString(),
    to: period.now.toISOString(),
    comparedWith: { from: period.previousStart.toISOString(), to: period.start.toISOString() },
  };
}

export interface WindowCount {
  /** Inside the selected period. */
  current: number;
  /** Inside the equally long period before it. */
  previous: number;
  change: PeriodChange;
}

export function windowCount(current: number, previous: number): WindowCount {
  return { current, previous, change: periodChange(current, previous) };
}

/** Mongo range for the selected period and the one before it. */
export function windowRanges(period: DashboardPeriod) {
  return {
    current: { $gte: period.start, $lt: period.now },
    previous: { $gte: period.previousStart, $lt: period.start },
  };
}

/** `[{ _id: status, count }]` → `{ status: count }`, skipping empty keys. */
export function countsByKey(rows: Array<{ _id: unknown; count: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row._id === null || row._id === undefined || row._id === "") continue;
    out[String(row._id)] = row.count;
  }
  return out;
}
