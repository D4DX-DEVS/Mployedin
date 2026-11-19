/**
 * The monthly schedule of a kpi3 target (jobs acquired, onboarded, revenue).
 *
 * Equal split: jobs and hires are whole numbers, so the remainder goes one each
 * to the first months (4 jobs → 1,1,1,1,0,…); revenue splits to the cent. A
 * manual split is the admin's own month figures, which must add up to each
 * yearly total. Pure: used by the create page and the server.
 */
import { defaultBounds, splitProfit, type SchedulePeriod } from "./schedule";

export interface KpiTotals {
  jobTarget: number;
  conversionTarget: number;
  revenueTarget: number;
}

export type KpiMonthFigures = Pick<KpiTotals, "jobTarget" | "conversionTarget" | "revenueTarget">;

/** `total` whole units over `n` slots, the remainder one each from the start. */
export function splitCount(total: number, n: number): number[] {
  const whole = Math.max(0, Math.floor(total));
  const base = Math.floor(whole / n);
  const rest = whole - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** The twelve months of `year` with each total split equally. */
export function equalKpiPeriods(year: number, totals: KpiTotals): SchedulePeriod[] {
  const bounds = defaultBounds("monthly", year);
  const jobs = splitCount(totals.jobTarget, bounds.length);
  const hires = splitCount(totals.conversionTarget, bounds.length);
  const revenue = splitProfit(totals.revenueTarget, bounds, "equal");
  return bounds.map((b, i) => ({
    ...b,
    profitTarget: 0,
    jobTarget: jobs[i],
    conversionTarget: hires[i],
    revenueTarget: revenue[i],
  }));
}

const cents = (n: number) => Math.round(n * 100);

/** Problems with a manual split, as codes the page and the server both understand. */
export function kpiPeriodIssues(
  periods: Partial<KpiMonthFigures>[],
  totals: KpiTotals,
): ("months" | "whole" | "jobsSum" | "onboardedSum" | "revenueSum")[] {
  if (periods.length !== 12) return ["months"];
  const issues: ("months" | "whole" | "jobsSum" | "onboardedSum" | "revenueSum")[] = [];
  const sum = (key: keyof KpiMonthFigures) => periods.reduce((s, p) => s + (p[key] ?? 0), 0);
  if (periods.some((p) => !Number.isInteger(p.jobTarget ?? 0) || !Number.isInteger(p.conversionTarget ?? 0))) issues.push("whole");
  if (sum("jobTarget") !== totals.jobTarget) issues.push("jobsSum");
  if (sum("conversionTarget") !== totals.conversionTarget) issues.push("onboardedSum");
  if (cents(sum("revenueTarget")) !== cents(totals.revenueTarget)) issues.push("revenueSum");
  return issues;
}

/** Manual figures placed on the twelve months of `year`. */
export function manualKpiPeriods(year: number, months: Partial<KpiMonthFigures>[]): SchedulePeriod[] {
  return defaultBounds("monthly", year).map((b, i) => ({
    ...b,
    profitTarget: 0,
    jobTarget: months[i]?.jobTarget ?? 0,
    conversionTarget: months[i]?.conversionTarget ?? 0,
    revenueTarget: months[i]?.revenueTarget ?? 0,
  }));
}
