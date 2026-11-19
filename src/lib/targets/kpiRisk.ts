/**
 * When a kpi3 target is at risk (docs/plans/2026-11-18-target-management-v2.md).
 *
 * Each pillar with a target is compared with the pace expected by today: a
 * pillar is at risk when it has reached less than 60% of that pace. The
 * weakest pillar is reported, so one alert names the pillar to work on.
 * Pure: no server imports.
 */
import { achievement } from "./achievement";

export type KpiPillar = "jobs" | "onboarded" | "revenue";

export interface KpiRiskInput {
  actual: { jobs: number; onboarded: number; revenue: number };
  target: { jobTarget?: number; conversionTarget?: number; revenueTarget?: number };
  /** Percent of the year gone by, 0–100. */
  expectedProgress: number;
}

export interface KpiRisk {
  pillar: KpiPillar;
  progress: number;
  expectedProgress: number;
}

/** Too early in the year for a fair pace check. */
const MIN_EXPECTED = 10;
const PACE_FLOOR = 0.6;

/** Percent of the calendar year gone by on `now` (UTC). */
export function yearElapsedPercent(now: Date, year: number): number {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const pct = ((now.getTime() - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function kpiRisk({ actual, target, expectedProgress }: KpiRiskInput): KpiRisk | null {
  if (expectedProgress < MIN_EXPECTED) return null;
  const pillars: { pillar: KpiPillar; progress: number | null }[] = [
    { pillar: "jobs", progress: achievement(actual.jobs, target.jobTarget ?? 0) },
    { pillar: "onboarded", progress: achievement(actual.onboarded, target.conversionTarget ?? 0) },
    { pillar: "revenue", progress: achievement(actual.revenue, target.revenueTarget ?? 0) },
  ];
  const behind = pillars
    .filter((p): p is { pillar: KpiPillar; progress: number } => p.progress !== null)
    .filter((p) => p.progress < expectedProgress * PACE_FLOOR)
    .sort((a, b) => a.progress / expectedProgress - b.progress / expectedProgress);
  return behind[0] ? { ...behind[0], expectedProgress } : null;
}

/**
 * A kpi3 profile's pace for the admin dashboard tiles, on the same scale as
 * targetPace() for profit profiles: achieved when every pillar with a target is
 * at 100%+, behind when any is more than 10 points under the expected share.
 */
export function kpiPace({ actual, target, expectedProgress }: KpiRiskInput): "behind" | "onPace" | "achieved" {
  const progress = [
    achievement(actual.jobs, target.jobTarget ?? 0),
    achievement(actual.onboarded, target.conversionTarget ?? 0),
    achievement(actual.revenue, target.revenueTarget ?? 0),
  ].filter((p): p is number => p !== null);
  if (progress.length === 0) return "onPace";
  if (progress.every((p) => p >= 100)) return "achieved";
  return progress.some((p) => p < expectedProgress - 10) ? "behind" : "onPace";
}
