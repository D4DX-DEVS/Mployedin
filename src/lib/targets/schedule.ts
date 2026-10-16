/**
 * The schedule of a profit target: the yearly amount cut into periods.
 *
 *   annual     one period, the whole year
 *   quarterly  Q1–Q4
 *   monthly    January–December
 *   weekly     calendar weeks (Monday–Sunday), the first and last clipped to the year
 *   custom     the owner's own date ranges, any number, gaps allowed
 *
 * Pure and free of server code, so the forms and the API cut a year the same
 * way. Dates are plain `YYYY-MM-DD` strings read as UTC calendar days: a
 * payment's day and a period's bounds then compare as strings, with no
 * timezone able to move a payment into the wrong period. Amounts are split in
 * integer cents so a decimal target adds up exactly.
 */

export const PERIOD_TYPES = ["annual", "quarterly", "monthly", "weekly", "custom"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export type SplitStrategy = "equal" | "seasonal" | "custom";

/** Weekly targets fill about 53 periods; a custom schedule is capped at the same order of size. */
export const MAX_PERIODS = 60;

export interface PeriodBounds {
  /** First day, inclusive, `YYYY-MM-DD`. */
  startDate: string;
  /** Last day, inclusive, `YYYY-MM-DD`. */
  endDate: string;
}

export interface SchedulePeriod extends PeriodBounds {
  /** A name for a custom period; the others are named by their position. */
  label?: string;
  profitTarget: number;
}

export type PeriodStatus = "upcoming" | "current" | "past";

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Q1 and Q3 weigh more: the recruitment seasons. */
const QUARTER_WEIGHTS = [0.3, 0.2, 0.3, 0.2];

const pad = (n: number) => String(n).padStart(2, "0");
export const toCents = (amount: number) => Math.round((amount || 0) * 100);
export const fromCents = (cents: number) => cents / 100;

/* ------------------------------------------------------------------ */
/*  Calendar days                                                      */
/* ------------------------------------------------------------------ */

/** A real calendar date in `YYYY-MM-DD` form (not 2027-02-30). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
}

/** Whole days since the epoch for a valid date string. */
export function dayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function dateFromDayNumber(days: number): string {
  const date = new Date(days * DAY_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Today in UTC, the calendar every payment day is read in. */
export function utcToday(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const yearStart = (year: number) => `${year}-01-01`;
const yearEnd = (year: number) => `${year}-12-31`;
const monthOf = (value: string) => Number(value.slice(5, 7));
/** A half-typed date in a form has no quarter; it counts as the first rather than poisoning the split. */
const quarterOf = (value: string) => (isIsoDate(value) ? Math.floor((monthOf(value) - 1) / 3) : 0);

/* ------------------------------------------------------------------ */
/*  Period boundaries                                                  */
/* ------------------------------------------------------------------ */

/** The boundaries a type implies for a year. `custom` starts as the whole year, for the owner to cut. */
export function defaultBounds(type: PeriodType, year: number): PeriodBounds[] {
  switch (type) {
    case "quarterly":
      return [0, 1, 2, 3].map((q) => ({
        startDate: `${year}-${pad(q * 3 + 1)}-01`,
        endDate: `${year}-${pad(q * 3 + 3)}-${pad(lastDayOfMonth(year, q * 3 + 3))}`,
      }));
    case "monthly":
      return Array.from({ length: 12 }, (_, i) => ({
        startDate: `${year}-${pad(i + 1)}-01`,
        endDate: `${year}-${pad(i + 1)}-${pad(lastDayOfMonth(year, i + 1))}`,
      }));
    case "weekly": {
      const bounds: PeriodBounds[] = [];
      const last = dayNumber(yearEnd(year));
      let start = dayNumber(yearStart(year));
      while (start <= last) {
        // Sunday closes the week: 0 days to go when the week starts on one.
        const weekday = new Date(start * DAY_MS).getUTCDay();
        const end = Math.min(start + ((7 - weekday) % 7), last);
        bounds.push({ startDate: dateFromDayNumber(start), endDate: dateFromDayNumber(end) });
        start = end + 1;
      }
      return bounds;
    }
    case "annual":
    case "custom":
    default:
      return [{ startDate: yearStart(year), endDate: yearEnd(year) }];
  }
}

/* ------------------------------------------------------------------ */
/*  Splitting an amount                                                */
/* ------------------------------------------------------------------ */

/** `totalCents` shared among `count`, the remainder going to the first ones. */
export function distributeEvenly(totalCents: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** `totalCents` shared by weight (largest remainder), always summing to the total. */
export function distributeByWeights(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const safe = weights.map((w) => (w > 0 ? w : 0));
  const sum = safe.reduce((s, w) => s + w, 0);
  if (sum <= 0) return distributeEvenly(totalCents, weights.length);
  const raw = safe.map((w) => (w / sum) * totalCents);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = totalCents - floored.reduce((s, v) => s + v, 0);
  const ranked = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let j = 0; j < ranked.length && remainder > 0; j++) {
    floored[ranked[j].i] += 1;
    remainder -= 1;
  }
  return floored;
}

/**
 * How `profitTarget` falls across periods. `equal` gives each period the same;
 * `seasonal` weighs a period by its quarter (30/20/30/20), shared among the
 * periods that start in it. `custom` has no rule: it starts from the equal split
 * for the owner to edit.
 */
export function splitProfit(profitTarget: number, bounds: PeriodBounds[], strategy: SplitStrategy): number[] {
  const total = toCents(profitTarget);
  if (strategy !== "seasonal") return distributeEvenly(total, bounds.length).map(fromCents);

  const perQuarter = [0, 0, 0, 0];
  for (const period of bounds) perQuarter[quarterOf(period.startDate)] += 1;
  const weights = bounds.map((period) => {
    const quarter = quarterOf(period.startDate);
    return QUARTER_WEIGHTS[quarter] / perQuarter[quarter];
  });
  return distributeByWeights(total, weights).map(fromCents);
}

/** The default schedule for a type: its boundaries with the amount split over them. */
export function buildSchedule(input: {
  periodType: PeriodType;
  year: number;
  profitTarget: number;
  strategy: SplitStrategy;
}): SchedulePeriod[] {
  const bounds = defaultBounds(input.periodType, input.year);
  const amounts = splitProfit(input.profitTarget, bounds, input.strategy);
  return bounds.map((period, i) => ({ ...period, profitTarget: amounts[i] }));
}

/** Re-split `profitTarget` over periods that already have their boundaries (a custom schedule's ranges). */
export function respread(periods: SchedulePeriod[], profitTarget: number, strategy: SplitStrategy): SchedulePeriod[] {
  const amounts = splitProfit(profitTarget, periods, strategy);
  return periods.map((period, i) => ({ ...period, profitTarget: amounts[i] }));
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

export type ScheduleIssueCode = "empty" | "tooMany" | "dates" | "reversed" | "outsideYear" | "overlap" | "amount" | "standard" | "sum";

export interface ScheduleIssue {
  code: ScheduleIssueCode;
  message: string;
}

/** What is wrong with a schedule; empty when it is sound. Codes let a form say it in the viewer's language. */
export function scheduleIssues(periods: SchedulePeriod[], year: number, annual: number, periodType: PeriodType): ScheduleIssue[] {
  if (periods.length === 0) return [{ code: "empty", message: "A schedule needs at least one period" }];
  if (periods.length > MAX_PERIODS) return [{ code: "tooMany", message: `A schedule can have at most ${MAX_PERIODS} periods` }];

  const issues: ScheduleIssue[] = [];
  let previousEnd = -Infinity;
  periods.forEach((period, index) => {
    const name = `Period ${index + 1}`;
    if (!isIsoDate(period.startDate) || !isIsoDate(period.endDate)) {
      issues.push({ code: "dates", message: `${name} needs real start and end dates` });
      return;
    }
    const start = dayNumber(period.startDate);
    const end = dayNumber(period.endDate);
    if (end < start) issues.push({ code: "reversed", message: `${name} ends before it starts` });
    if (period.startDate < yearStart(year) || period.endDate > yearEnd(year)) {
      issues.push({ code: "outsideYear", message: `${name} falls outside ${year}` });
    }
    if (start <= previousEnd) issues.push({ code: "overlap", message: `${name} overlaps the period before it` });
    previousEnd = Math.max(previousEnd, end);
    if (!Number.isFinite(period.profitTarget) || period.profitTarget < 0) {
      issues.push({ code: "amount", message: `${name} needs an amount of 0 or more` });
    }
  });
  if (issues.length > 0) return issues;

  if (periodType !== "custom") {
    const expected = defaultBounds(periodType, year);
    const matches = expected.length === periods.length
      && expected.every((bounds, i) => bounds.startDate === periods[i].startDate && bounds.endDate === periods[i].endDate);
    if (!matches) issues.push({ code: "standard", message: `A ${periodType} schedule must use the standard ${periodType} periods of ${year}` });
  }

  const sum = periods.reduce((total, period) => total + toCents(period.profitTarget), 0);
  if (sum !== toCents(annual)) {
    issues.push({ code: "sum", message: `Period amounts (${fromCents(sum)}) must add up to the target (${annual})` });
  }
  return issues;
}

/** The same issues as plain messages, for an API answer. */
export function validateSchedule(periods: SchedulePeriod[], year: number, annual: number, periodType: PeriodType): string[] {
  return scheduleIssues(periods, year, annual, periodType).map((issue) => issue.message);
}

export type ResolvedSchedule = { periods: SchedulePeriod[] } | { error: string; details: string[] };

/**
 * The schedule to store for a target: the periods the caller sent, checked, or
 * the standard ones generated from the type and split. A custom schedule, and a
 * manually typed split over several periods, have no rule to generate from, so
 * the caller must send their periods.
 */
export function resolveSchedule(input: {
  year: number;
  profitTarget: number;
  periodType: PeriodType;
  strategy: SplitStrategy;
  periods?: SchedulePeriod[];
}): ResolvedSchedule {
  const { year, profitTarget, periodType, strategy } = input;
  let periods = input.periods;

  if (!periods) {
    const needsPeriods = periodType === "custom" || (strategy === "custom" && defaultBounds(periodType, year).length > 1);
    if (needsPeriods) {
      return { error: "A custom schedule needs its periods", details: ["Send the periods and their amounts"] };
    }
    periods = buildSchedule({ periodType, year, profitTarget, strategy });
  }

  const details = validateSchedule(periods, year, profitTarget, periodType);
  if (details.length > 0) return { error: "The schedule must add up to the target", details };
  return { periods };
}

/** The same schedule moved to another year; 29 February lands on the 28th when the year has none. */
export function shiftScheduleYear(periods: SchedulePeriod[], toYear: number): SchedulePeriod[] {
  const move = (value: string) => {
    const [, month, day] = value.split("-");
    const moved = `${toYear}-${month}-${day}`;
    return isIsoDate(moved) ? moved : `${toYear}-${month}-${pad(lastDayOfMonth(toYear, Number(month)))}`;
  };
  return periods.map((period) => ({ ...period, startDate: move(period.startDate), endDate: move(period.endDate) }));
}

/**
 * A schedule carried into another year at a new yearly amount. A custom set of
 * ranges moves with its dates, a standard type is cut afresh for the year, and
 * hand-typed amounts keep their proportions so the shape of the year survives.
 */
export function cloneSchedule(
  source: { periodType: PeriodType; strategy: SplitStrategy; periods: SchedulePeriod[] },
  toYear: number,
  profitTarget: number,
): { periods: SchedulePeriod[]; strategy: SplitStrategy } {
  const cents = toCents(profitTarget);
  const proportional = (periods: PeriodBounds[]) =>
    distributeByWeights(cents, source.periods.map((period) => period.profitTarget)).map(fromCents).map((amount, i) => ({ ...periods[i], profitTarget: amount }));

  if (source.periodType === "custom") {
    const shifted = shiftScheduleYear(source.periods, toYear);
    const moved = proportional(shifted).map((period, i) => ({ ...period, ...(shifted[i].label ? { label: shifted[i].label } : {}) }));
    if (validateSchedule(moved, toYear, profitTarget, "custom").length === 0) return { periods: moved, strategy: source.strategy };
    // A shift that collides (29 February) falls back to the whole year as one period.
    return { periods: buildSchedule({ periodType: "annual", year: toYear, profitTarget, strategy: "equal" }), strategy: "equal" };
  }

  const bounds = defaultBounds(source.periodType, toYear);
  if (source.strategy === "custom") {
    // Typed amounts only carry over when the new year has the same number of periods (a weekly year may not).
    if (bounds.length === source.periods.length) return { periods: proportional(bounds), strategy: "custom" };
    return { periods: buildSchedule({ periodType: source.periodType, year: toYear, profitTarget, strategy: "equal" }), strategy: "equal" };
  }
  return { periods: buildSchedule({ periodType: source.periodType, year: toYear, profitTarget, strategy: source.strategy }), strategy: source.strategy };
}

/* ------------------------------------------------------------------ */
/*  Reading a schedule                                                 */
/* ------------------------------------------------------------------ */

/**
 * What each month of the year carries of the schedule: every period's amount
 * spread over its days. A monthly schedule gives back its own months; an annual
 * one gives each month its share of the days. This is the series the monthly
 * chart and the "this month" figures read, whatever the period type.
 */
export function monthlyTargets(periods: SchedulePeriod[]): number[] {
  const floats = new Array<number>(12).fill(0);
  for (const period of periods) {
    const start = dayNumber(period.startDate);
    const end = dayNumber(period.endDate);
    const days = end - start + 1;
    if (days <= 0) continue;
    const perDay = toCents(period.profitTarget) / days;
    for (let day = start; day <= end; day++) {
      floats[new Date(day * DAY_MS).getUTCMonth()] += perDay;
    }
  }
  const total = periods.reduce((sum, period) => sum + toCents(period.profitTarget), 0);
  return distributeByWeights(total, floats.map((value) => value || 0)).map(fromCents);
}

export function periodStatus(period: PeriodBounds, today: string): PeriodStatus {
  if (today < period.startDate) return "upcoming";
  if (today > period.endDate) return "past";
  return "current";
}

/**
 * Share of the whole target that should be done by `now`: each period counts in
 * proportion to the days of it that have passed. A finished schedule expects
 * 100, one that has not begun 0. With no target there is nothing to pace, so
 * it falls back to the share of the year gone by.
 */
export function expectedProgress(periods: SchedulePeriod[], year: number, now: Date = new Date()): number {
  const today = utcToday(now);
  const totalCents = periods.reduce((sum, period) => sum + toCents(period.profitTarget), 0);
  if (totalCents <= 0) {
    const currentYear = now.getUTCFullYear();
    if (year < currentYear) return 100;
    if (year > currentYear) return 0;
    return Math.round(((now.getUTCMonth() + 1) / 12) * 100);
  }

  let expectedCents = 0;
  for (const period of periods) {
    const cents = toCents(period.profitTarget);
    const status = periodStatus(period, today);
    if (status === "past") expectedCents += cents;
    else if (status === "current") {
      const days = dayNumber(period.endDate) - dayNumber(period.startDate) + 1;
      expectedCents += cents * ((dayNumber(today) - dayNumber(period.startDate) + 1) / days);
    }
  }
  return Math.round((expectedCents / totalCents) * 100);
}

/* ------------------------------------------------------------------ */
/*  Stored form                                                        */
/* ------------------------------------------------------------------ */

export interface StoredPeriod {
  label?: string;
  startDate: Date;
  endDate: Date;
  profitTarget: number;
}

export function toStoredPeriods(periods: SchedulePeriod[]): StoredPeriod[] {
  return periods.map(({ label, startDate, endDate, profitTarget }) => ({
    ...(label ? { label } : {}),
    startDate: new Date(`${startDate}T00:00:00.000Z`),
    endDate: new Date(`${endDate}T00:00:00.000Z`),
    profitTarget,
  }));
}

export function fromStoredPeriods(stored: { label?: string; startDate: Date | string; endDate: Date | string; profitTarget: number }[] | undefined): SchedulePeriod[] {
  const day = (value: Date | string) => (typeof value === "string" ? value : value.toISOString()).slice(0, 10);
  return (stored ?? []).map((period) => ({
    ...(period.label ? { label: period.label } : {}),
    startDate: day(period.startDate),
    endDate: day(period.endDate),
    profitTarget: period.profitTarget,
  }));
}
