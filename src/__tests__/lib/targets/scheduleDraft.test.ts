/**
 * @jest-environment node
 */
import { toCents } from "@/lib/targets/schedule";
import {
  draftFromProfile,
  draftIssues,
  newDraft,
  withAddedPeriod,
  withAmount,
  withPeriodAmount,
  withPeriodField,
  withPeriodType,
  withRemovedPeriod,
  withStrategy,
} from "@/lib/targets/scheduleDraft";

const YEAR = 2027;
const total = (draft: { periods: { profitTarget: number }[] }) => draft.periods.reduce((sum, p) => sum + toCents(p.profitTarget), 0);

describe("a fresh draft", () => {
  it("is a monthly, equal split that adds up", () => {
    const draft = newDraft(YEAR, 1200);

    expect(draft.periodType).toBe("monthly");
    expect(draft.periods).toHaveLength(12);
    expect(draftIssues(draft, YEAR, 1200)).toEqual([]);
  });
});

describe("changing the amount", () => {
  it("re-spreads a rule-based split", () => {
    const draft = withAmount(newDraft(YEAR, 1200), YEAR, 2400);

    expect(draft.periods.every((p) => p.profitTarget === 200)).toBe(true);
    expect(draftIssues(draft, YEAR, 2400)).toEqual([]);
  });

  it("leaves hand-typed amounts alone, so the form can flag the gap rather than overwrite them", () => {
    const typed = withPeriodAmount(newDraft(YEAR, 1200), 0, 500);
    const after = withAmount(typed, YEAR, 2400);

    expect(after.periods[0].profitTarget).toBe(500);
    expect(draftIssues(after, YEAR, 2400)[0].code).toBe("sum");
  });

  it("always keeps an annual schedule at the full amount, whatever its split", () => {
    const annual = withPeriodType(newDraft(YEAR, 1200), YEAR, 1200, "annual");
    expect(withAmount(annual, YEAR, 900).periods[0].profitTarget).toBe(900);
  });
});

describe("changing the period type", () => {
  it("cuts the year again for the new type", () => {
    for (const [type, count] of [["annual", 1], ["quarterly", 4], ["monthly", 12], ["weekly", 53], ["custom", 1]] as const) {
      const draft = withPeriodType(newDraft(YEAR, 1200), YEAR, 1200, type);
      expect(draft.periodType).toBe(type);
      expect(draft.periods).toHaveLength(count);
      expect(draftIssues(draft, YEAR, 1200)).toEqual([]);
    }
  });

  it("drops a manual split back to equal, since typed amounts do not fit new periods", () => {
    const typed = withPeriodAmount(newDraft(YEAR, 1200), 0, 500);
    const quarterly = withPeriodType(typed, YEAR, 1200, "quarterly");

    expect(quarterly.strategy).toBe("equal");
    expect(quarterly.periods.map((p) => p.profitTarget)).toEqual([300, 300, 300, 300]);
  });

  it("keeps a seasonal split when the cut changes", () => {
    const seasonal = withStrategy(newDraft(YEAR, 1200), 1200, "seasonal");
    expect(withPeriodType(seasonal, YEAR, 1200, "quarterly").periods.map((p) => p.profitTarget)).toEqual([360, 240, 360, 240]);
  });
});

describe("changing the split", () => {
  it("re-spreads for equal and seasonal, and keeps the amounts for manual", () => {
    const base = newDraft(YEAR, 1200, "quarterly");
    const seasonal = withStrategy(base, 1200, "seasonal");
    expect(seasonal.periods.map((p) => p.profitTarget)).toEqual([360, 240, 360, 240]);

    const manual = withStrategy(seasonal, 1200, "custom");
    expect(manual.strategy).toBe("custom");
    expect(manual.periods.map((p) => p.profitTarget)).toEqual([360, 240, 360, 240]);
  });

  it("makes typing a period's amount a manual split", () => {
    const draft = withPeriodAmount(newDraft(YEAR, 1200, "quarterly"), 1, 450);

    expect(draft.strategy).toBe("custom");
    expect(draft.periods[1].profitTarget).toBe(450);
    expect(draftIssues(draft, YEAR, 1200)[0].code).toBe("sum");
  });
});

describe("a custom schedule", () => {
  const custom = () => withPeriodType(newDraft(YEAR, 1000), YEAR, 1000, "custom");

  it("starts as the whole year and can be cut into ranges", () => {
    let draft = withPeriodField(custom(), 1000, 0, "endDate", "2027-03-31");
    draft = withAddedPeriod(draft, YEAR, 1000);

    expect(draft.periods.map((p) => [p.startDate, p.endDate])).toEqual([
      ["2027-01-01", "2027-03-31"],
      ["2027-04-01", "2027-12-31"],
    ]);
    // Equal split over the two ranges, still adding up.
    expect(draft.periods.map((p) => p.profitTarget)).toEqual([500, 500]);
    expect(draftIssues(draft, YEAR, 1000)).toEqual([]);
  });

  it("re-spreads when a range changes, unless the amounts are typed", () => {
    let draft = withAddedPeriod(withPeriodField(custom(), 1000, 0, "endDate", "2027-06-30"), YEAR, 1000);
    draft = withPeriodAmount(draft, 0, 700);
    draft = withPeriodField(draft, 1000, 1, "startDate", "2027-07-15");

    expect(draft.periods.map((p) => p.profitTarget)).toEqual([700, 500]);
  });

  it("flags overlapping ranges and ranges outside the year", () => {
    let draft = withAddedPeriod(withPeriodField(custom(), 1000, 0, "endDate", "2027-06-30"), YEAR, 1000);
    draft = withPeriodField(draft, 1000, 1, "startDate", "2027-06-15");
    expect(draftIssues(draft, YEAR, 1000)[0].code).toBe("overlap");

    draft = withPeriodField(draft, 1000, 1, "startDate", "2026-12-01");
    expect(draftIssues(draft, YEAR, 1000)[0].code).toBe("outsideYear");
  });

  it("will not add a period when the year is used up, nor remove the only one", () => {
    const full = custom();
    expect(withAddedPeriod(full, YEAR, 1000)).toBe(full);
    expect(withRemovedPeriod(full, 1000, 0)).toBe(full);
  });

  it("removes a period and gives its share to the others", () => {
    const two = withAddedPeriod(withPeriodField(custom(), 1000, 0, "endDate", "2027-06-30"), YEAR, 1000);
    const one = withRemovedPeriod(two, 1000, 1);

    expect(one.periods).toHaveLength(1);
    expect(total(one)).toBe(100000);
  });

  it("names and un-names a period", () => {
    const named = withPeriodField(custom(), 1000, 0, "label", "Spring push");
    expect(named.periods[0].label).toBe("Spring push");
    expect(withPeriodField(named, 1000, 0, "label", "").periods[0].label).toBeUndefined();
  });

  it("copes with a half-typed date without producing NaN amounts", () => {
    const draft = withAddedPeriod(withPeriodField(custom(), 1000, 0, "endDate", "2027-06-30"), YEAR, 1000);
    const broken = withPeriodField(withStrategy(draft, 1000, "seasonal"), 1000, 1, "startDate", "2027-0");

    expect(broken.periods.every((p) => Number.isFinite(p.profitTarget))).toBe(true);
    expect(draftIssues(broken, YEAR, 1000)[0].code).toBe("dates");
  });
});

describe("editing a stored profile", () => {
  it("starts from its schedule and carries nothing but the schedule", () => {
    const draft = draftFromProfile({
      periodType: "quarterly",
      distributionStrategy: "seasonal",
      periods: [
        { startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 360, profitAchieved: 90, profitProgress: 25, status: "past" } as never,
      ],
    });

    expect(draft.periodType).toBe("quarterly");
    expect(draft.strategy).toBe("seasonal");
    expect(draft.periods[0]).toEqual({ startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 360 });
  });
});
