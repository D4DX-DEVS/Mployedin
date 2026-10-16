/**
 * What a target report says beyond "X of Y": whether the target is done, on
 * pace, behind or not yet started; how it is growing against last year and
 * against its own previous period; how long is left; and where it is heading if
 * the rest of the schedule goes at the pace so far. Pure, so the API, the
 * report builder and the tests share one reading of a target.
 */

import { targetPace, type TargetPace } from "./pace";
import { dayNumber, utcToday, type PeriodStatus, type SchedulePeriod } from "./schedule";

/** Where a target stands: the dashboard's pace, plus "not started" for a schedule that has not begun. */
export type CompletionStatus = TargetPace | "notStarted";

export type GrowthTrend = "up" | "down" | "flat" | "new" | "none";

export interface Growth {
  previous: number;
  /** Change against `previous` in whole percent; null when there was nothing to compare with. */
  pct: number | null;
  trend: GrowthTrend;
}

export interface TargetTimeline {
  /** First and last day of the schedule, `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  daysTotal: number;
  /** Days of the schedule gone by, today included; 0 before it starts. */
  daysElapsed: number;
  /** Days still to go after today; 0 once it has ended. */
  daysLeft: number;
  /** Days until the schedule starts; 0 once it has. */
  daysToStart: number;
}

/** What the target is heading for if the rest of the schedule goes as the part so far. */
export interface Forecast {
  profit: number;
  /** Share of the target that profit would be, in whole percent. */
  progress: number;
}

export interface TargetInsights {
  status: CompletionStatus;
  /** Profit still to make to reach the target; 0 once it is reached. */
  remaining: number;
  /** Null when the target has no periods to measure time by. */
  timeline: TargetTimeline | null;
  /** Null before the schedule has begun and while it is too early for a figure to mean anything. */
  forecast: Forecast | null;
  /** This year's profit so far against the whole previous year's. */
  yearOverYear: Growth;
  /** The latest finished period against the one before it; null with fewer than two finished periods. */
  momentum: (Growth & { latest: number }) | null;
}

/** Below this share of the schedule gone by a run-rate is noise, not a forecast. */
const MIN_EXPECTED_FOR_FORECAST = 10;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Change from `previous` to `current`, with no percentage when `previous` gives nothing to measure against. */
export function growthOf(current: number, previous: number): Growth {
  if (previous > 0) {
    const pct = Math.round(((current - previous) / previous) * 100);
    return { previous, pct, trend: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
  }
  return { previous, pct: null, trend: current > 0 ? "new" : "none" };
}

function timelineOf(periods: Pick<SchedulePeriod, "startDate" | "endDate">[], today: string): TargetTimeline | null {
  if (periods.length === 0) return null;
  const startDate = periods.reduce((first, period) => (period.startDate < first ? period.startDate : first), periods[0].startDate);
  const endDate = periods.reduce((last, period) => (period.endDate > last ? period.endDate : last), periods[0].endDate);
  const start = dayNumber(startDate);
  const end = dayNumber(endDate);
  const now = dayNumber(today);
  const daysTotal = end - start + 1;
  return {
    startDate,
    endDate,
    daysTotal,
    daysElapsed: Math.min(Math.max(now - start + 1, 0), daysTotal),
    daysLeft: Math.min(Math.max(end - now, 0), daysTotal),
    daysToStart: Math.max(start - now, 0),
  };
}

interface InsightPeriod extends SchedulePeriod {
  profitAchieved: number;
  status: PeriodStatus;
}

export interface InsightSource {
  profitTarget: number;
  profitAchieved: number;
  profitProgress: number;
  expectedProgress: number;
  riskScore: "high" | "medium" | "low";
  periods: InsightPeriod[];
}

export function targetInsights(source: InsightSource, previousYearProfit: number, now: Date = new Date()): TargetInsights {
  const today = utcToday(now);
  const timeline = timelineOf(source.periods, today);
  const notStarted = timeline !== null && timeline.daysToStart > 0;
  const pace = targetPace(source);
  const status: CompletionStatus = pace === "achieved" ? "achieved" : notStarted ? "notStarted" : pace;

  let forecast: Forecast | null = null;
  if (source.profitTarget > 0 && !notStarted) {
    // A finished schedule, or a target already met, forecasts what it made. Otherwise the
    // profit so far is scaled to the share of the target the schedule expected by now.
    const settled = status === "achieved" || source.expectedProgress >= 100;
    const projected = settled
      ? source.profitAchieved
      : source.expectedProgress >= MIN_EXPECTED_FOR_FORECAST
        ? (source.profitAchieved * 100) / source.expectedProgress
        : null;
    if (projected !== null) {
      forecast = { profit: round2(projected), progress: Math.round((projected / source.profitTarget) * 100) };
    }
  }

  const finished = source.periods.filter((period) => period.status === "past");
  const [before, latest] = finished.slice(-2);
  const momentum = finished.length >= 2 ? { ...growthOf(latest.profitAchieved, before.profitAchieved), latest: latest.profitAchieved } : null;

  return {
    status,
    remaining: Math.max(0, round2(source.profitTarget - source.profitAchieved)),
    timeline,
    forecast,
    yearOverYear: growthOf(source.profitAchieved, previousYearProfit),
    momentum,
  };
}
