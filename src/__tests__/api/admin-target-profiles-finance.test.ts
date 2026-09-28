/**
 * @jest-environment node
 */
/**
 * Admin Target Management totals and underperformers. The finance total used
 * to add INR plans to AED ones (612,000 AED + 10,003 INR read "622,003"), and
 * the underperformer list judged a 2027 plan by September 2026's pace.
 */
import { NextRequest } from "next/server";
import { financeTotals } from "@/lib/targets/financeTotals";

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
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({
  ...jest.requireActual("@/lib/targets/profileAchievementCalculator"),
  enrichProfiles: (...args: unknown[]) => enrichProfiles(...args),
}));

function plan(id: string, currency: string, financeTarget: number, financeAchieved: number) {
  return {
    _id: id, assigneeId: `u-${id}`, assigneeRole: "super_agent", currency,
    employerTarget: 10, employerAchieved: 0, employeeTarget: 10, employeeAchieved: 0,
    financeTarget, financeAchieved, overallProgress: 0, riskScore: "low", incentiveTier: "none",
    monthlyAchievements: [],
  };
}

const PLANS = [
  plan("p1", "AED", 600000, 1000),
  plan("p2", "AED", 12000, 0),
  plan("p3", "INR", 5000, 250),
  plan("p4", "INR", 5003, 0),
];

describe("financeTotals", () => {
  it("keeps the largest-target currency and lists the others", () => {
    expect(financeTotals(PLANS)).toEqual({
      currency: "AED",
      target: 612000,
      achieved: 1000,
      others: [{ currency: "INR", target: 10003, achieved: 250 }],
    });
  });

  it("reads a plan without a currency as AED, and nothing as no currency", () => {
    expect(financeTotals([{ currency: null, financeTarget: 5, financeAchieved: 1 }]).currency).toBe("AED");
    expect(financeTotals([])).toEqual({ currency: null, target: 0, achieved: 0, others: [] });
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

  it("returns the finance total in one currency, never INR added to AED", async () => {
    const { GET } = await import("@/app/api/admin/target-profiles/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/target-profiles?year=2027"), { params: Promise.resolve({}) });
    const body = await res.json();

    expect(body.totals.finance).toEqual({
      currency: "AED",
      target: 612000,
      achieved: 1000,
      others: [{ currency: "INR", target: 10003, achieved: 250 }],
    });
  });

  it("lists no underperformers for a year that has not started", async () => {
    const nextYear = new Date().getFullYear() + 1;
    const { GET } = await import("@/app/api/admin/target-profiles/analytics/route");
    const res = await GET(new NextRequest(`http://localhost/api/admin/target-profiles/analytics?year=${nextYear}`), { params: Promise.resolve({}) });

    expect((await res.json()).underperformers).toEqual([]);
  });

  it("still lists a past year's plans that fell short", async () => {
    const lastYear = new Date().getFullYear() - 1;
    const { GET } = await import("@/app/api/admin/target-profiles/analytics/route");
    const res = await GET(new NextRequest(`http://localhost/api/admin/target-profiles/analytics?year=${lastYear}`), { params: Promise.resolve({}) });
    const body = await res.json();

    // A finished year expects 100%; all four plans sit at 0%.
    expect(body.underperformers).toHaveLength(4);
    expect(body.underperformers[0].expectedProgress).toBe(100);
  });
});
