/**
 * @jest-environment node
 */
/**
 * A finance target is an amount in one currency, and nothing converts: only
 * commissions in the target's own currency count towards it. INR commissions
 * used to be added to AED targets as if they were dirhams.
 */
import { enrichProfile, enrichProfiles } from "@/lib/targets/profileAchievementCalculator";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const commissionAggregate = jest.fn();
const agentFindLean = jest.fn();

jest.mock("@/models/Commission", () => ({ __esModule: true, default: { aggregate: (...args: unknown[]) => commissionAggregate(...args) } }));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: { aggregate: jest.fn().mockResolvedValue([]), countDocuments: jest.fn().mockResolvedValue(0) } }));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { aggregate: jest.fn().mockResolvedValue([]), countDocuments: jest.fn().mockResolvedValue(0) } }));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ select: jest.fn(() => ({ lean: agentFindLean })) })) },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ _id: "5f0000000000000000000009" }) })) })) },
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn().mockResolvedValue({ effectiveAgentIds: ["5f0000000000000000000011"] }),
}));

const AGENT_AED = "5f0000000000000000000011";
const AGENT_INR = "5f0000000000000000000012";

function profile(overrides: Record<string, unknown>) {
  return {
    _id: "p", assignedBy: "admin", year: 2026, status: "active",
    employerTarget: 0, employeeTarget: 0, financeTarget: 1000,
    monthlyTargets: [
      { month: 1, employerTarget: 0, employeeTarget: 0, financeTarget: 500 },
      { month: 2, employerTarget: 0, employeeTarget: 0, financeTarget: 500 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("finance progress by currency", () => {
  it("gives each agent only the commissions in its own target's currency", async () => {
    agentFindLean.mockResolvedValue([
      { _id: AGENT_AED, userId: "u-aed" },
      { _id: AGENT_INR, userId: "u-inr" },
    ]);
    commissionAggregate.mockResolvedValue([
      { _id: { agentId: AGENT_AED, month: 1, currency: "AED" }, total: 100 },
      // Same agent, other currency: not progress towards an AED target.
      { _id: { agentId: AGENT_AED, month: 1, currency: "INR" }, total: 5000 },
      { _id: { agentId: AGENT_INR, month: 2, currency: "INR" }, total: 700 },
    ]);

    const [aed, inr] = await enrichProfiles([
      profile({ _id: "p-aed", assigneeId: "u-aed", assigneeRole: "agent", currency: "AED" }),
      profile({ _id: "p-inr", assigneeId: "u-inr", assigneeRole: "agent", currency: "INR" }),
    ]);

    expect(aed.financeAchieved).toBe(100);
    expect(aed.monthlyAchievements.find((row) => row.month === 1)?.financeAchieved).toBe(100);
    expect(inr.financeAchieved).toBe(700);
    expect(inr.monthlyAchievements.find((row) => row.month === 2)?.financeAchieved).toBe(700);
  });

  it("matches a super agent's commissions on its target currency, legacy rows counting as AED", async () => {
    commissionAggregate.mockResolvedValue([{ _id: null, total: 250 }]);

    const aed = await enrichProfile(profile({ _id: "p-sa", assigneeId: "u-sa", assigneeRole: "super_agent", currency: "AED" }));
    const matches = commissionAggregate.mock.calls.map(([pipeline]) => (pipeline as Array<{ $match?: { currency?: unknown } }>)[0].$match?.currency);

    expect(aed.financeAchieved).toBe(250);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((currency) => JSON.stringify(currency) === JSON.stringify({ $in: ["AED", null] }))).toBe(true);

    commissionAggregate.mockClear();
    await enrichProfile(profile({ _id: "p-sa2", assigneeId: "u-sa", assigneeRole: "super_agent", currency: "INR" }));
    expect(commissionAggregate.mock.calls.every(([pipeline]) => (pipeline as Array<{ $match: { currency: unknown } }>)[0].$match.currency === "INR")).toBe(true);
  });
});
