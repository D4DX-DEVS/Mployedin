/**
 * @jest-environment node
 */
/**
 * One definition of Accepted all / Rejected all / Custom choice, used by the
 * admin counts, the grouped choices table (as a database filter) and the
 * browser. A missing category (a lone log row) is never accepted or rejected.
 */
import {
  COOKIE_CHOICE_PERIODS,
  DEFAULT_COOKIE_CHOICE_PERIOD,
  cookieChoiceOutcome,
  cookieChoiceOutcomeFilter,
  isCookieChoicePeriod,
  periodStart,
  type CookieChoiceOutcome,
} from "@/lib/gdpr/cookieChoiceOutcome";

type Doc = { preferences: boolean | null; media: boolean | null };

/** Just enough of MongoDB's matcher for the filters this module builds: field equality and $nor. */
function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$nor") return !(value as Array<Record<string, unknown>>).some((f) => matches(doc, f));
    return doc[key as keyof Doc] === value;
  });
}

const STATES = [true, false, null] as const;
const ALL: Doc[] = STATES.flatMap((preferences) => STATES.map((media) => ({ preferences, media })));

describe("cookieChoiceOutcome", () => {
  it.each([
    [true, true, "accepted"],
    [false, false, "rejected"],
    [true, false, "custom"],
    [false, true, "custom"],
  ] as const)("reads display %s and videos %s as %s", (preferences, media, outcome) => {
    expect(cookieChoiceOutcome({ preferences, media })).toBe(outcome);
  });

  it.each([
    [true, null],
    [null, true],
    [false, null],
    [null, false],
    [null, null],
  ] as const)("reads a choice with a category not recorded (%s, %s) as custom", (preferences, media) => {
    expect(cookieChoiceOutcome({ preferences, media })).toBe("custom");
  });
});

describe("cookieChoiceOutcomeFilter", () => {
  it.each(["accepted", "rejected", "custom"] as CookieChoiceOutcome[])(
    "selects exactly the choices cookieChoiceOutcome calls %s",
    (outcome) => {
      const filter = cookieChoiceOutcomeFilter(outcome);
      for (const doc of ALL) {
        expect([doc, matches(doc, filter)]).toEqual([doc, cookieChoiceOutcome(doc) === outcome]);
      }
    },
  );

  it("is a plain equality filter for accepted and rejected (so an index can serve it)", () => {
    expect(cookieChoiceOutcomeFilter("accepted")).toEqual({ preferences: true, media: true });
    expect(cookieChoiceOutcomeFilter("rejected")).toEqual({ preferences: false, media: false });
  });
});

describe("periods", () => {
  it("offers 7, 30, 90 and 365 days, 30 by default", () => {
    expect(COOKIE_CHOICE_PERIODS).toEqual([7, 30, 90, 365]);
    expect(DEFAULT_COOKIE_CHOICE_PERIOD).toBe(30);
  });

  it.each([7, 30, 90, 365])("accepts %i", (days) => expect(isCookieChoicePeriod(days)).toBe(true));
  it.each([0, 1, 14, 31, 366, -30, 30.5, Number.NaN])("rejects %s", (days) => expect(isCookieChoicePeriod(days)).toBe(false));

  it("counts back whole 24-hour days from now", () => {
    const now = Date.UTC(2026, 9, 21, 12, 0, 0);
    expect(periodStart(30, now).toISOString()).toBe("2026-09-21T12:00:00.000Z");
    expect(periodStart(7, now).toISOString()).toBe("2026-10-14T12:00:00.000Z");
  });
});
