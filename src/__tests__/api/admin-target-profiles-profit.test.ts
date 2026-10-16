/**
 * @jest-environment node
 */
/**
 * Admin Target Management totals and underperformers. Profit is a money amount
 * in its plan's currency and nothing converts, so an INR plan must never be
 * added to an AED one, and the underperformer list judges a 2027 plan by 2027's
 * pace, not by September 2026's.
 */
import { NextRequest } from "next/server";
import { profitTotals } from "@/lib/targets/profitTotals";

const connectDB = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: connectDB, connectDB }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));

const profileFindLean = jest.fn();
const userFindLean = jest.fn();
const superAgentFindLean = jest.fn();
const enrichProfiles = jest.fn();

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  PROFIT_TARGET_FILTER: { targetType: "profit" },
  default: {
    // The list sorts in the query; analytics does not.
    find: jest.fn(() => ({ sort: jest.fn(() => ({ lean: profileFindLean })), lean: profileFindLean })),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ select: jest.fn(() => ({ lean: userFindLean })) })) },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ select: jest.fn(() => ({ lean: superAgentFindLean })) })) },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({
  ...jest.requireActual("@/lib/targets/profileAchievementCalculator"),
  enrichProfiles: (...args: unknown[]) => enrichProfiles(...args),
}));

function plan(id: string, currency: string, profitTarget: number, profitAchieved: number) {
  return {
    _id: id, assigneeId: `u-${id}`, assigneeRole: "super_agent", currency,
    profitTarget, profitAchieved, profitProgress: 0, expectedProgress: 50, riskScore: "low", incentiveTier: "none",
    monthlyAchievements: [],
  };
}

const PLANS = [
  plan("p1", "AED", 600000, 1000),
  plan("p2", "AED", 12000, 0),
  plan("p3", "INR", 5000, 250),
  plan("p4", "INR", 5003, 0),
];

describe("profitTotals", () => {
  it("keeps the largest-target currency and lists the others", () => {
    expect(profitTotals(PLANS)).toEqual({
      currency: "AED",
      target: 612000,
      achieved: 1000,
      others: [{ currency: "INR", target: 10003, achieved: 250 }],
    });
  });

  it("reads a plan without a currency as AED, and nothing as no currency", () => {
    expect(profitTotals([{ currency: null, profitTarget: 5, profitAchieved: 1 }]).currency).toBe("AED");
    expect(profitTotals([])).toEqual({ currency: null, target: 0, achieved: 0, others: [] });
  });

  it("adds decimal amounts without float noise", () => {
    const totals = profitTotals([
      { currency: "AED", profitTarget: 0.1, profitAchieved: 0.2 },
      { currency: "AED", profitTarget: 0.2, profitAchieved: 0.1 },
    ]);

    expect(totals.target).toBe(0.3);
    expect(totals.achieved).toBe(0.3);
  });
});

describe("admin Target Management APIs", () => {
  const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    profileFindLean.mockResolvedValue(PLANS.map(({ _id, assigneeId }) => ({ _id, assigneeId, assigneeRole: "super_agent" })));
    userFindLean.mockResolvedValue(PLANS.map((row) => ({ _id: row.assigneeId, name: row._id, email: `${row._id}@x.test` })));
    superAgentFindLean.mockResolvedValue([]);
    enrichProfiles.mockResolvedValue(PLANS);
  });

  it("returns the profit total in one currency, never INR added to AED", async () => {
    const { GET } = await import("@/app/api/admin/target-profiles/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/target-profiles?year=2027"), { params: Promise.resolve({}) });
    const body = await res.json();

    expect(body.totals.profit).toEqual({
      currency: "AED",
      target: 612000,
      achieved: 1000,
      others: [{ currency: "INR", target: 10003, achieved: 250 }],
    });
  });

  it("lists no underperformers for a plan whose schedule has not started", async () => {
    enrichProfiles.mockResolvedValue(PLANS.map((row) => ({ ...row, expectedProgress: 0 })));
    const nextYear = new Date().getFullYear() + 1;
    const { GET } = await import("@/app/api/admin/target-profiles/analytics/route");
    const res = await GET(new NextRequest(`http://localhost/api/admin/target-profiles/analytics?year=${nextYear}`), { params: Promise.resolve({}) });

    expect((await res.json()).underperformers).toEqual([]);
  });

  it("still lists plans whose schedule is over and that fell short", async () => {
    enrichProfiles.mockResolvedValue(PLANS.map((row) => ({ ...row, expectedProgress: 100 })));
    const lastYear = new Date().getFullYear() - 1;
    const { GET } = await import("@/app/api/admin/target-profiles/analytics/route");
    const res = await GET(new NextRequest(`http://localhost/api/admin/target-profiles/analytics?year=${lastYear}`), { params: Promise.resolve({}) });
    const body = await res.json();

    // A finished schedule expects 100%; all four plans sit at 0%.
    expect(body.underperformers).toHaveLength(4);
    expect(body.underperformers[0].expectedProgress).toBe(100);
  });

  it("compares regions per currency instead of adding them together", async () => {
    const { GET } = await import("@/app/api/admin/target-profiles/analytics/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/target-profiles/analytics?year=2027"), { params: Promise.resolve({}) });
    const body = await res.json();

    expect(body.regionComparison).toHaveLength(1);
    expect(body.regionComparison[0].profit.others).toEqual([{ currency: "INR", target: 10003, achieved: 250 }]);
  });
});
