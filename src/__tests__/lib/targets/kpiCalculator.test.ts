/**
 * @jest-environment node
 */
/** Pure parts of the three-pillar calculator (lib/targets/kpiCalculator). */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));

import { achievement, bucketKpiEvents, hiredAtOf, lineRevenue, onboardedDate, type KpiEvent } from "@/lib/targets/kpiCalculator";

const agentScope = (agentIds: string[], extra: Partial<{ role: "agent" | "super_agent"; periods: { startDate: string; endDate: string }[] }> = {}) => ({
  key: "k",
  role: extra.role ?? ("agent" as const),
  currency: "AED",
  agentIds: new Set(agentIds),
  periods: extra.periods,
});

describe("lineRevenue: invoice total minus tax, per line", () => {
  it("takes the discount off and keeps the service charge", () => {
    // 1000 subtotal, 10% discount, 50 service charge → 900 + 50
    expect(lineRevenue({ lineAmount: 1000, subtotal: 1000, discountPercent: 10, serviceCharge: 50 })).toBe(950);
  });

  it("shares the service charge across lines by amount", () => {
    const base = { subtotal: 40000, serviceCharge: 400 };
    expect(lineRevenue({ ...base, lineAmount: 24000 })).toBe(24240);
    expect(lineRevenue({ ...base, lineAmount: 16000 })).toBe(16160);
  });

  it("scales down by a partial refund", () => {
    expect(lineRevenue({ lineAmount: 1000, subtotal: 1000, totalAmount: 1050, refundedAmount: 525 })).toBe(500);
  });

  it("is 0 for an empty line", () => {
    expect(lineRevenue({ lineAmount: 0, subtotal: 100 })).toBe(0);
  });
});

describe("onboarded date", () => {
  it("is the later of the hire and the job's close", () => {
    const feb = new Date("2027-02-10");
    const mar = new Date("2027-03-03");
    expect(onboardedDate(feb, mar)).toEqual(mar);
    expect(onboardedDate(mar, feb)).toEqual(mar);
  });

  it("does not count while the job is open", () => {
    expect(onboardedDate(new Date(), null)).toBeNull();
  });

  it("reads the latest move into hired from the history", () => {
    const app = {
      statusHistory: [
        { status: "hired", changedAt: new Date("2027-01-05") },
        { status: "offer", changedAt: new Date("2027-01-20") },
        { status: "hired", changedAt: new Date("2027-02-01") },
      ],
      updatedAt: new Date("2027-05-01"),
    };
    expect(hiredAtOf(app)).toEqual(new Date("2027-02-01"));
    expect(hiredAtOf({ updatedAt: new Date("2027-05-01") })).toEqual(new Date("2027-05-01"));
  });
});

describe("bucketKpiEvents", () => {
  const events: KpiEvent[] = [
    { kind: "jobs", agentId: "a1", day: "2027-01-12", amount: 1 },
    { kind: "jobs", agentId: "a1", day: "2027-03-02", amount: 1 },
    { kind: "jobs", agentId: "a2", day: "2027-03-09", amount: 1 },
    { kind: "onboarded", agentId: "a1", day: "2027-03-20", amount: 1 },
    { kind: "revenue", agentId: "a1", day: "2027-03-21", amount: 24000, currency: "AED" },
    { kind: "revenue", agentId: "a2", day: "2027-03-22", amount: 18000, currency: "AED" },
    { kind: "revenue", agentId: "a1", day: "2027-03-23", amount: 50000, currency: "INR" },
    { kind: "jobs", agentId: "a1", day: "2026-12-31", amount: 1 },
    { kind: "jobs", agentId: "other", day: "2027-03-01", amount: 1 },
  ];

  it("counts only the owner's items in the year, by month", () => {
    const out = bucketKpiEvents(agentScope(["a1"]), events, 2027);
    expect(out.totals).toEqual({ jobs: 2, onboarded: 1, revenue: 24000 });
    expect(out.months[0]).toEqual({ month: 1, jobs: 1, onboarded: 0, revenue: 0 });
    expect(out.months[2]).toEqual({ month: 3, jobs: 1, onboarded: 1, revenue: 24000 });
  });

  it("keeps other currencies apart and never adds them", () => {
    const out = bucketKpiEvents(agentScope(["a1"]), events, 2027);
    expect(out.otherCurrencies).toEqual([{ currency: "INR", revenue: 50000 }]);
  });

  it("gives a super agent their team's total once, and each agent's share", () => {
    const out = bucketKpiEvents(agentScope(["a1", "a2"], { role: "super_agent" }), events, 2027);
    expect(out.totals).toEqual({ jobs: 3, onboarded: 1, revenue: 42000 });
    expect(out.byAgent.get("a2")).toEqual({ jobs: 1, onboarded: 0, revenue: 18000 });
  });

  it("fills schedule periods by their inclusive bounds", () => {
    const periods = [
      { startDate: "2027-01-01", endDate: "2027-03-02" },
      { startDate: "2027-03-03", endDate: "2027-12-31" },
    ];
    const out = bucketKpiEvents(agentScope(["a1"], { periods }), events, 2027);
    expect(out.periods.map((p) => p.jobs)).toEqual([2, 0]);
    expect(out.periods[1].onboarded).toBe(1);
  });
});

describe("achievement", () => {
  it("is actual over target as a whole percent, or null with no target", () => {
    expect(achievement(8, 10)).toBe(80);
    expect(achievement(150000, 200000)).toBe(75);
    expect(achievement(3, 0)).toBeNull();
  });
});
