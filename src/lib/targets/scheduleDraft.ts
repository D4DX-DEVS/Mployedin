/**
 * The schedule a form is editing, and how each edit changes it. Pure, so the
 * rules live in one place and the admin form, the super agent's distribute
 * dialog and the edit panel all behave alike:
 *
 *  - a new amount, type or split re-cuts the schedule, unless the amounts were
 *    typed by hand (strategy "custom"), which a new amount must not overwrite;
 *  - typing a period's amount makes the split manual;
 *  - a custom schedule re-spreads over the owner's ranges when the split is not manual.
 */

import {
  MAX_PERIODS,
  buildSchedule,
  dateFromDayNumber,
  dayNumber,
  defaultBounds,
  respread,
  scheduleIssues,
  type PeriodType,
  type SchedulePeriod,
  type ScheduleIssue,
  type SplitStrategy,
} from "./schedule";

export interface ScheduleDraft {
  periodType: PeriodType;
  strategy: SplitStrategy;
  periods: SchedulePeriod[];
}

const yearEnd = (year: number) => `${year}-12-31`;

/** A fresh draft: a monthly, equal split of `profitTarget` unless told otherwise. */
export function newDraft(
  year: number,
  profitTarget: number,
  periodType: PeriodType = "monthly",
  strategy: SplitStrategy = "equal",
): ScheduleDraft {
  return { periodType, strategy, periods: buildSchedule({ periodType, year, profitTarget, strategy }) };
}

/** The draft of a stored profile, to edit it. */
export function draftFromProfile(profile: {
  periodType?: PeriodType;
  distributionStrategy?: string;
  periods: SchedulePeriod[];
}): ScheduleDraft {
  const strategy: SplitStrategy =
    profile.distributionStrategy === "seasonal" || profile.distributionStrategy === "custom" ? profile.distributionStrategy : "equal";
  return {
    periodType: profile.periodType ?? "monthly",
    strategy,
    // Only what a schedule is made of: a stored period also carries what it has earned so far.
    periods: profile.periods.map(({ label, startDate, endDate, profitTarget }) => ({
      ...(label ? { label } : {}),
      startDate,
      endDate,
      profitTarget,
    })),
  };
}

/** A new yearly amount. Hand-typed amounts stay as typed (the form flags a mismatch); the rest re-spread. */
export function withAmount(draft: ScheduleDraft, year: number, profitTarget: number): ScheduleDraft {
  if (draft.strategy === "custom" && draft.periodType !== "annual") return draft;
  return { ...draft, periods: respread(draft.periods, profitTarget, draft.strategy) };
}

/** A new period type: the year is cut again, and a manual split cannot follow it onto new periods. */
export function withPeriodType(draft: ScheduleDraft, year: number, profitTarget: number, periodType: PeriodType): ScheduleDraft {
  const strategy: SplitStrategy = draft.strategy === "custom" ? "equal" : draft.strategy;
  return { periodType, strategy, periods: buildSchedule({ periodType, year, profitTarget, strategy }) };
}

/** A new split rule. Manual keeps the amounts as they stand; the others re-spread them over the same periods. */
export function withStrategy(draft: ScheduleDraft, profitTarget: number, strategy: SplitStrategy): ScheduleDraft {
  if (strategy === "custom") return { ...draft, strategy };
  return { ...draft, strategy, periods: respread(draft.periods, profitTarget, strategy) };
}

/** Typing one period's amount makes the split manual. */
export function withPeriodAmount(draft: ScheduleDraft, index: number, amount: number): ScheduleDraft {
  return {
    ...draft,
    strategy: "custom",
    periods: draft.periods.map((period, i) => (i === index ? { ...period, profitTarget: amount } : period)),
  };
}

function settle(draft: ScheduleDraft, profitTarget: number, periods: SchedulePeriod[]): ScheduleDraft {
  const next = { ...draft, periods };
  return draft.strategy === "custom" ? next : { ...next, periods: respread(periods, profitTarget, draft.strategy) };
}

/** Custom schedules only: change a period's name or one of its dates. */
export function withPeriodField(
  draft: ScheduleDraft,
  profitTarget: number,
  index: number,
  field: "label" | "startDate" | "endDate",
  value: string,
): ScheduleDraft {
  const periods = draft.periods.map((period, i) => {
    if (i !== index) return period;
    if (field === "label") return value ? { ...period, label: value } : { ...period, label: undefined };
    return { ...period, [field]: value };
  });
  return settle(draft, profitTarget, periods);
}

/** Custom schedules only: add a period after the last one, running to the end of the year. */
export function withAddedPeriod(draft: ScheduleDraft, year: number, profitTarget: number): ScheduleDraft {
  if (draft.periods.length >= MAX_PERIODS) return draft;
  const last = draft.periods[draft.periods.length - 1];
  const start = last && last.endDate ? dateFromDayNumber(dayNumber(last.endDate) + 1) : `${year}-01-01`;
  const end = yearEnd(year);
  // No room left in the year: leave it to the owner to free some up.
  if (start > end) return draft;
  return settle(draft, profitTarget, [...draft.periods, { startDate: start, endDate: end, profitTarget: 0 }]);
}

/** Custom schedules only: drop a period (the last one cannot go: a schedule needs a period). */
export function withRemovedPeriod(draft: ScheduleDraft, profitTarget: number, index: number): ScheduleDraft {
  if (draft.periods.length <= 1) return draft;
  return settle(draft, profitTarget, draft.periods.filter((_, i) => i !== index));
}

/** Is the draft one the API will accept? The issues, empty when it is. */
export function draftIssues(draft: ScheduleDraft, year: number, profitTarget: number): ScheduleIssue[] {
  return scheduleIssues(draft.periods, year, profitTarget, draft.periodType);
}

/** True when the draft cuts the year the standard way for its type. */
export function usesStandardPeriods(draft: ScheduleDraft, year: number): boolean {
  const bounds = defaultBounds(draft.periodType, year);
  return draft.periodType !== "custom" && bounds.length === draft.periods.length;
}
