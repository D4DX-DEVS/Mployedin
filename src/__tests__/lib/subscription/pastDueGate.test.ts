/**
 * @jest-environment node
 */
import { checkFeatureGate } from "@/lib/subscription/featureGate";
import { isPastDueInGrace, getPastDueGraceDays } from "@/lib/subscription/gracePeriod";
import Subscription from "@/models/Subscription";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn() }));
jest.mock("@/models/Subscription", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/lib/subscription/enforcementFlag", () => ({
  isSubscriptionEnforcementEnabled: jest.fn().mockResolvedValue(true),
}));

const findOne = (Subscription as unknown as { findOne: jest.Mock }).findOne;
const DAY = 86_400_000;

const limits = { maxActiveJobs: 5, maxApplicationsViewPerMonth: 10, maxTeamMembers: 2, aiFeatures: [], dataExport: true };

function pastDue(daysAgo: number) {
  return {
    userId: "u1", targetRole: "employer", status: "past_due",
    pastDueSince: new Date(Date.now() - daysAgo * DAY),
    planSnapshot: { name: "Gold", tier: 2, employerLimits: limits },
    usage: { aiUsage: {} },
  };
}

beforeEach(() => {
  findOne.mockReset();
});

afterEach(() => {
  delete process.env.PAYMENT_PAST_DUE_GRACE_DAYS;
});

describe("past_due grace", () => {
  it("defaults to 7 days, env override respected and bounded", () => {
    expect(getPastDueGraceDays()).toBe(7);
    process.env.PAYMENT_PAST_DUE_GRACE_DAYS = "3";
    expect(getPastDueGraceDays()).toBe(3);
    process.env.PAYMENT_PAST_DUE_GRACE_DAYS = "999";
    expect(getPastDueGraceDays()).toBe(7);
  });

  it("isPastDueInGrace", () => {
    expect(isPastDueInGrace(pastDue(2))).toBe(true);
    expect(isPastDueInGrace(pastDue(8))).toBe(false);
    expect(isPastDueInGrace({ status: "past_due" })).toBe(false);
    expect(isPastDueInGrace({ status: "active", pastDueSince: new Date() })).toBe(false);
  });

  it("checkFeatureGate keeps plan access during the grace window", async () => {
    findOne.mockReturnValue({ lean: () => Promise.resolve(pastDue(2)) });
    expect(await checkFeatureGate("u1", { type: "toggle", feature: "dataExport" }, "employer")).toEqual({ allowed: true });
  });

  it("checkFeatureGate blocks once the grace window has passed", async () => {
    findOne.mockReturnValue({ lean: () => Promise.resolve(pastDue(10)) });
    expect(await checkFeatureGate("u1", { type: "toggle", feature: "dataExport" }, "employer")).toEqual({
      allowed: false,
      reason: "PAYMENT_PAST_DUE",
    });
  });

  it("a single lookup covers active + past_due", async () => {
    findOne.mockReturnValue({ lean: () => Promise.resolve(pastDue(1)) });
    await checkFeatureGate("u1", { type: "toggle", feature: "dataExport" }, "employer");
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(findOne.mock.calls[0][0].$or).toEqual([
      { status: "active", endDate: { $gt: expect.any(Date) } },
      { status: "past_due" },
    ]);
  });
});
