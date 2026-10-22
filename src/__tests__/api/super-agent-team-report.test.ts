/**
 * @jest-environment node
 */
/**
 * The super-agent Team report (`/api/super-agent/reports`).
 *
 * Its commission figure used to add every line together whatever its currency
 * and status — an INR line counted as AED, a clawed-back line counted as
 * earned — and the page then labelled the sum in the super agent's settings
 * currency. The report now answers in the dominant currency, lists the others
 * separately, counts pending, approved and paid only, and counts what the
 * team's agents earned (the super agent's overrides are on the Commissions tab).
 */
import { NextRequest } from "next/server";
import mongoose from "mongoose";

const AGENT_A = new mongoose.Types.ObjectId();
const AGENT_B = new mongoose.Types.ObjectId();
const USER_A = new mongoose.Types.ObjectId();
const USER_B = new mongoose.Types.ObjectId();
const SA_PROFILE = new mongoose.Types.ObjectId();

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (req: NextRequest, ctx: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest) =>
      handler(req, { userId: "sa_001", role: "super_agent", locale: "en" }),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn(async () => ({ effectiveAgentIds: [AGENT_A, AGENT_B], saProfileId: SA_PROFILE })),
}));

function selectLean<T>(value: T) {
  return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) };
}

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { find: () => selectLean([{ _id: AGENT_A, userId: USER_A }, { _id: AGENT_B, userId: USER_B }]) },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: () => selectLean([
      { _id: USER_A, name: "Ahmed", isActive: true },
      { _id: USER_B, name: "Sara", isActive: false },
    ]),
    countDocuments: jest.fn().mockResolvedValue(1),
  },
}));
jest.mock("@/models/Lead", () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn().mockResolvedValue(10),
    aggregate: jest.fn(async (pipeline: Array<Record<string, { _id?: unknown }>>) => {
      const group = pipeline.find((stage) => stage.$group)?.$group;
      return group?._id === "$agentId"
        ? [{ _id: AGENT_A, total: 8, converted: 2 }, { _id: AGENT_B, total: 2, converted: 0 }]
        : [];
    }),
  },
}));
jest.mock("@/models/Placement", () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn().mockResolvedValue(3),
    aggregate: jest.fn(async (pipeline: Array<Record<string, { _id?: unknown }>>) => {
      const group = pipeline.find((stage) => stage.$group)?.$group;
      return group?._id === "$agentId" ? [{ _id: AGENT_A, count: 3 }] : [];
    }),
  },
}));

const mockCommissionAggregate = jest.fn();
jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: { aggregate: (...args: unknown[]) => mockCommissionAggregate(...args) },
}));

type Stage = Record<string, Record<string, unknown>>;

beforeEach(() => {
  mockCommissionAggregate.mockReset();
  mockCommissionAggregate.mockImplementation(async (pipeline: Stage[]) => {
    const group = pipeline.find((stage) => stage.$group)?.$group;
    if (group?._id === "$currency") {
      return [
        { _id: "AED", total: 9000 },
        { _id: "INR", total: 4000 },
        { _id: null, total: 1000 },
      ];
    }
    if (group?._id === "$agentId") return [{ _id: AGENT_A, total: 6000 }];
    return [];
  });
});

async function callReport() {
  const { GET } = await import("@/app/api/super-agent/reports/route");
  const res = await GET(new NextRequest("http://localhost/api/super-agent/reports"), { params: Promise.resolve({}) });
  return res.json();
}

describe("GET /api/super-agent/reports", () => {
  it("reports commission in the dominant currency and lists the rest apart", async () => {
    const body = await callReport();
    // A line with no currency is AED (the schema default) and joins that total.
    expect(body.currency).toBe("AED");
    expect(body.totalCommissions).toBe(10000);
    expect(body.otherCurrencies).toEqual([{ currency: "INR", total: 4000 }]);
  });

  it("counts only pending, approved and paid lines", async () => {
    await callReport();
    for (const [pipeline] of mockCommissionAggregate.mock.calls as [Stage[]][]) {
      const match = pipeline.find((stage) => stage.$match)?.$match as { status?: { $in: string[] } };
      expect(match.status).toEqual({ $in: ["pending", "approved", "paid"] });
    }
  });

  it("keys commission on the earning agent, never on the overseeing super agent", async () => {
    // Placement lines carry superAgentId as the overseer; matching on it would
    // count lines from agents who have since moved to another team.
    await callReport();
    for (const [pipeline] of mockCommissionAggregate.mock.calls as [Stage[]][]) {
      const match = pipeline.find((stage) => stage.$match)?.$match as Record<string, unknown>;
      expect(match.agentId).toEqual({ $in: [AGENT_A, AGENT_B] });
      expect(JSON.stringify(match)).not.toContain("superAgentId");
    }
  });

  it("keeps per-agent and monthly money in the reported currency", async () => {
    await callReport();
    const calls = mockCommissionAggregate.mock.calls as [Stage[]][];
    const scoped = calls.filter(([pipeline]) => {
      const group = pipeline.find((stage) => stage.$group)?.$group;
      return group?._id !== "$currency";
    });
    expect(scoped.length).toBe(2);
    for (const [pipeline] of scoped) {
      expect(pipeline.find((stage) => stage.$match)?.$match.currency).toEqual({ $in: ["AED", null] });
    }
  });

  it("gives each agent row an id to link to, and flags inactive agents", async () => {
    const body = await callReport();
    expect(body.agentBreakdown[0]).toMatchObject({
      agentId: String(AGENT_A),
      name: "Ahmed",
      isActive: true,
      leads: 8,
      convertedLeads: 2,
      conversionRate: 25,
      placements: 3,
      commission: 6000,
    });
    expect(body.agentBreakdown[1]).toMatchObject({ agentId: String(AGENT_B), isActive: false });
  });

  it("sends months as YYYY-MM so the page can name them in the reader's language", async () => {
    const body = await callReport();
    expect(body.monthlyTrends).toHaveLength(6);
    for (const row of body.monthlyTrends) expect(row.month).toMatch(/^\d{4}-\d{2}$/);
  });
});
