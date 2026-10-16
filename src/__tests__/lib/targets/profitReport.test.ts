/**
 * @jest-environment node
 */
import { buildTargetReport, categoriesOf, previousYearOf, type NamedProfile } from "@/lib/targets/profitReport";
import type { EnrichedProfile } from "@/lib/targets/profileAchievementCalculator";

function profile(overrides: Partial<EnrichedProfile>): EnrichedProfile {
  return {
    _id: "p", assigneeId: "u", assigneeRole: "agent", assignedBy: "admin", year: 2027, currency: "AED",
    profitTarget: 1000, profitAchieved: 0, profitProgress: 0, profitPending: 1000,
    distributionStrategy: "equal", periodType: "monthly", periods: [], expectedProgress: 50,
    status: "active", createdAt: "", updatedAt: "",
    riskScore: "low", incentiveTier: "none",
    drivers: { profit: 0, revenue: 0, commissionCost: 0, invoicesPaid: 0, placements: 0, newEmployers: 0 },
    byCategory: [],
    monthlyAchievements: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, profit: 0, revenue: 0, commissionCost: 0, invoicesPaid: 0, placements: 0, newEmployers: 0,
      profitTarget: 0, profitAchieved: 0, profitProgress: 0,
    })),
    ...overrides,
  } as EnrichedProfile;
}

const named = (p: EnrichedProfile, name: string): NamedProfile => ({ profile: p, name, email: `${name}@x.test` });

describe("categoriesOf", () => {
  it("gives each income stream its share of the profit", () => {
    expect(categoriesOf([{ category: "recruitment", profit: 750 }, { category: "subscription", profit: 250 }])).toEqual([
      { category: "recruitment", profit: 750, share: 75 },
      { category: "subscription", profit: 250, share: 25 },
    ]);
  });

  it("has no shares when there is no profit", () => {
    expect(categoriesOf([{ category: "recruitment", profit: 0 }])[0].share).toBe(0);
    expect(categoriesOf([])).toEqual([]);
  });
});

describe("previousYearOf", () => {
  it("is growth against last year's profit", () => {
    expect(previousYearOf(2027, 150, 100)).toEqual({ year: 2026, profit: 100, growthPct: 50 });
    expect(previousYearOf(2027, 50, 100).growthPct).toBe(-50);
  });

  it("has no growth figure when last year had no profit to compare with", () => {
    expect(previousYearOf(2027, 150, 0).growthPct).toBeNull();
  });
});

describe("buildTargetReport", () => {
  it("summarises one person against the pace their own schedule expects", () => {
    const agent = profile({ profitAchieved: 300, profitProgress: 30, profitPending: 700, riskScore: "high", expectedProgress: 50 });
    const report = buildTargetReport({ subject: named(agent, "Adam"), previousYearProfit: 200 });

    expect(report.summary).toMatchObject({
      profitTarget: 1000, profitAchieved: 300, profitProgress: 30, expectedProgress: 50, riskScore: "high", pace: "behind",
    });
    expect(report.person).toMatchObject({ name: "Adam", role: "agent", profileId: "p" });
    expect(report.previousYear).toEqual({ year: 2026, profit: 200, growthPct: 50 });
    expect(report.months).toHaveLength(12);
    expect(report).not.toHaveProperty("team");
  });

  it("reads the target's completion status, growth and forecast into the summary", () => {
    const agent = profile({ profitAchieved: 300, profitProgress: 30, profitPending: 700, riskScore: "high", expectedProgress: 50 });
    const report = buildTargetReport({ subject: named(agent, "Adam"), previousYearProfit: 200, now: new Date("2027-07-01T12:00:00Z") });

    expect(report.summary.insights).toMatchObject({
      status: "behind",
      remaining: 700,
      forecast: { profit: 600, progress: 60 },
      yearOverYear: { previous: 200, pct: 50, trend: "up" },
    });
  });

  it("carries the schedule with what each period earned", () => {
    const periods = [
      { startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 500, profitAchieved: 450, profitProgress: 90, status: "past" as const },
      { startDate: "2027-04-01", endDate: "2027-12-31", profitTarget: 500, profitAchieved: 0, profitProgress: 0, status: "current" as const },
    ];
    const report = buildTargetReport({ subject: named(profile({ periodType: "custom", periods }), "Adam"), previousYearProfit: 0 });

    expect(report.schedule.periodType).toBe("custom");
    expect(report.schedule.periods).toEqual(periods);
  });

  it("uses each profile's own expected pace, so a weekly plan and an annual one are not judged alike", () => {
    const early = buildTargetReport({ subject: named(profile({ expectedProgress: 10 }), "A"), previousYearProfit: 0 });
    const late = buildTargetReport({ subject: named(profile({ expectedProgress: 90 }), "B"), previousYearProfit: 0 });

    expect([early.summary.expectedProgress, late.summary.expectedProgress]).toEqual([10, 90]);
  });

  it("marks someone at or over target as achieved", () => {
    const report = buildTargetReport({
      subject: named(profile({ profitAchieved: 1000, profitProgress: 100, riskScore: "low" }), "Adam"),
      previousYearProfit: 0
    });

    expect(report.summary.pace).toBe("achieved");
  });

  it("gives a super agent a team section with each agent's share and the profit that is not theirs", () => {
    const sa = profile({ _id: "sa", assigneeId: "u-sa", assigneeRole: "super_agent", profitTarget: 2000, profitAchieved: 1000, profitProgress: 50 });
    const a1 = profile({ _id: "a1", assigneeId: "u-a1", profitTarget: 700, profitAchieved: 600, profitProgress: 86 });
    const a2 = profile({ _id: "a2", assigneeId: "u-a2", profitTarget: 500, profitAchieved: 100, profitProgress: 20, riskScore: "high" });
    const foreign = profile({ _id: "a3", assigneeId: "u-a3", currency: "INR", profitTarget: 9000, profitAchieved: 9000, profitProgress: 100 });

    const report = buildTargetReport({
      subject: named(sa, "Sara"),
      previousYearProfit: 0,
      team: [named(a2, "Zed"), named(a1, "Amy"), named(foreign, "Ravi")]
    });

    // Best progress first; ties by name.
    expect(report.team?.rows.map((row) => row.name)).toEqual(["Ravi", "Amy", "Zed"]);
    expect(report.team?.rows.find((row) => row.name === "Amy")).toMatchObject({ shareOfTeam: 60, pace: "onPace" });
    expect(report.team?.rows.find((row) => row.name === "Zed")).toMatchObject({ shareOfTeam: 10, pace: "behind" });
    // Another currency is listed but cannot be measured against this profit.
    expect(report.team?.rows.find((row) => row.name === "Ravi")?.shareOfTeam).toBe(0);
    // 1000 − (600 + 100): income that came through override lines or non-team invoices.
    expect(report.team?.otherProfit).toBe(300);
    expect(report.team?.allocatedTarget).toBe(1200);
  });

  it("never reports negative other profit", () => {
    const sa = profile({ _id: "sa", assigneeRole: "super_agent", profitAchieved: 100 });
    const agent = profile({ _id: "a1", profitAchieved: 150 });

    const report = buildTargetReport({ subject: named(sa, "Sara"), previousYearProfit: 0, team: [named(agent, "Amy")] });

    expect(report.team?.otherProfit).toBe(0);
  });
});
