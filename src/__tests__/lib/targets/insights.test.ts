/**
 * @jest-environment node
 */
/**
 * Reading a target: completion status, growth against last year and against its
 * previous period, time left, and where it is heading.
 */
import { growthOf, targetInsights, type InsightSource } from "@/lib/targets/insights";
import { defaultReportYear } from "@/lib/targets/reportYear";

const period = (startDate: string, endDate: string, profitTarget: number, profitAchieved: number, status: "past" | "current" | "upcoming") => ({
  startDate, endDate, profitTarget, profitAchieved, status, profitProgress: profitTarget > 0 ? Math.round((profitAchieved / profitTarget) * 100) : 0,
});

const QUARTERS = [
  period("2027-01-01", "2027-03-31", 300, 300, "past"),
  period("2027-04-01", "2027-06-30", 200, 150, "past"),
  period("2027-07-01", "2027-09-30", 300, 0, "current"),
  period("2027-10-01", "2027-12-31", 200, 0, "upcoming"),
];

function source(overrides: Partial<InsightSource> = {}): InsightSource {
  return {
    profitTarget: 1000, profitAchieved: 450, profitProgress: 45, expectedProgress: 50, riskScore: "low",
    periods: QUARTERS, ...overrides,
  };
}

const MID_YEAR = new Date("2027-07-15T12:00:00Z");

describe("growthOf", () => {
  it("is the change in whole percent against what there was", () => {
    expect(growthOf(150, 100)).toEqual({ previous: 100, pct: 50, trend: "up" });
    expect(growthOf(50, 100)).toEqual({ previous: 100, pct: -50, trend: "down" });
    expect(growthOf(100, 100)).toEqual({ previous: 100, pct: 0, trend: "flat" });
  });

  it("has no percentage with nothing to compare against: new when something was made, none otherwise", () => {
    expect(growthOf(150, 0)).toEqual({ previous: 0, pct: null, trend: "new" });
    expect(growthOf(0, 0)).toEqual({ previous: 0, pct: null, trend: "none" });
  });
});

describe("targetInsights", () => {
  describe("status", () => {
    it("is on pace when the progress keeps up with the schedule and behind when it does not", () => {
      expect(targetInsights(source(), 0, MID_YEAR).status).toBe("onPace");
      expect(targetInsights(source({ profitProgress: 20, riskScore: "high" }), 0, MID_YEAR).status).toBe("behind");
    });

    it("is achieved once the target is met", () => {
      expect(targetInsights(source({ profitAchieved: 1200, profitProgress: 120 }), 0, MID_YEAR).status).toBe("achieved");
    });

    it("is not started while the schedule has not begun, so a future year is not judged", () => {
      const insights = targetInsights(source({ expectedProgress: 0, profitAchieved: 0, profitProgress: 0 }), 0, new Date("2026-10-15T12:00:00Z"));

      expect(insights.status).toBe("notStarted");
      expect(insights.forecast).toBeNull();
      expect(insights.timeline).toMatchObject({ daysToStart: 78, daysElapsed: 0, daysLeft: 365 });
    });

    it("has no timeline, and falls back to pace, for a target with no periods", () => {
      const insights = targetInsights(source({ periods: [], expectedProgress: 0 }), 0, MID_YEAR);

      expect(insights.timeline).toBeNull();
      expect(insights.status).toBe("onPace");
    });
  });

  describe("timeline", () => {
    it("counts the days gone and the days left, today included in the first", () => {
      expect(targetInsights(source(), 0, MID_YEAR).timeline).toEqual({
        startDate: "2027-01-01", endDate: "2027-12-31", daysTotal: 365, daysElapsed: 196, daysLeft: 169, daysToStart: 0,
      });
    });

    it("is over, with nothing left, after the last day", () => {
      expect(targetInsights(source(), 0, new Date("2028-02-01T00:00:00Z")).timeline).toMatchObject({ daysElapsed: 365, daysLeft: 0 });
    });

    it("spans a custom schedule from its first day to its last, gaps and all", () => {
      const custom = [period("2027-03-01", "2027-04-30", 600, 0, "upcoming"), period("2027-09-01", "2027-09-30", 400, 0, "upcoming")];

      expect(targetInsights(source({ periods: custom }), 0, new Date("2027-02-01T00:00:00Z")).timeline).toMatchObject({
        startDate: "2027-03-01", endDate: "2027-09-30", daysTotal: 214, daysToStart: 28,
      });
    });
  });

  describe("forecast", () => {
    it("scales the profit so far to the share of the target the schedule expected by now", () => {
      // 450 made where 50% was expected: 900 at this pace, 90% of a 1000 target.
      expect(targetInsights(source(), 0, MID_YEAR).forecast).toEqual({ profit: 900, progress: 90 });
    });

    it("is what was made once the schedule has ended or the target is met", () => {
      expect(targetInsights(source({ expectedProgress: 100, profitAchieved: 700, profitProgress: 70, riskScore: "high" }), 0, MID_YEAR).forecast)
        .toEqual({ profit: 700, progress: 70 });
      expect(targetInsights(source({ profitAchieved: 1500, profitProgress: 150 }), 0, MID_YEAR).forecast).toEqual({ profit: 1500, progress: 150 });
    });

    it("waits until enough of the schedule has gone by to mean anything", () => {
      expect(targetInsights(source({ expectedProgress: 4, profitAchieved: 10, profitProgress: 1 }), 0, MID_YEAR).forecast).toBeNull();
    });
  });

  it("is what remains of the target, never negative", () => {
    expect(targetInsights(source(), 0, MID_YEAR).remaining).toBe(550);
    expect(targetInsights(source({ profitAchieved: 1500, profitProgress: 150 }), 0, MID_YEAR).remaining).toBe(0);
  });

  it("compares this year's profit with last year's", () => {
    expect(targetInsights(source(), 300, MID_YEAR).yearOverYear).toEqual({ previous: 300, pct: 50, trend: "up" });
    expect(targetInsights(source(), 0, MID_YEAR).yearOverYear).toMatchObject({ pct: null, trend: "new" });
  });

  describe("momentum", () => {
    it("compares the latest finished period with the one before", () => {
      // 150 in Q2 against 300 in Q1.
      expect(targetInsights(source(), 0, MID_YEAR).momentum).toEqual({ previous: 300, latest: 150, pct: -50, trend: "down" });
    });

    it("needs two finished periods", () => {
      const early = [period("2027-01-01", "2027-03-31", 300, 300, "past"), ...QUARTERS.slice(1).map((p) => ({ ...p, status: "upcoming" as const }))];

      expect(targetInsights(source({ periods: early }), 0, MID_YEAR).momentum).toBeNull();
    });
  });
});

describe("defaultReportYear", () => {
  it("opens on the current year when it has targets", () => {
    expect(defaultReportYear([2027, 2026], 2026)).toBe(2026);
  });

  it("opens on the nearest year that has targets when the current one has none", () => {
    expect(defaultReportYear([2027], 2026)).toBe(2027);
    expect(defaultReportYear([2020, 2024], 2026)).toBe(2024);
  });

  it("prefers the upcoming year on a tie, and the current year when nothing has targets", () => {
    expect(defaultReportYear([2025, 2027], 2026)).toBe(2027);
    expect(defaultReportYear([], 2026)).toBe(2026);
  });
});
