/**
 * @jest-environment node
 *
 * Per-agent average commission rate must cover all of the agent's commissions.
 * The breakdown groups by (agent, status), and the row builder used to keep the
 * $avg of whichever status group came first — so an agent with a 5% pending
 * commission and a 15% paid one showed 5% or 15%, never 10%.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: "admin"; locale: string }) => Promise<Response>) => {
    return (req: NextRequest) => handler(req, { userId: "admin_user_001", role: "admin", locale: "en" });
  },
}));

const AGENT_ID = "64b000000000000000000001";
const AGENT_USER_ID = "64b000000000000000000002";

type Stage = { $match?: unknown; $group?: { _id: unknown } };

/** Mimics MongoDB for the pipelines the route runs, over a fixed commission set. */
const COMMISSIONS = [
  { agentId: AGENT_ID, status: "pending", amount: 100, rate: 5, type: "placement", currency: "AED", month: 3 },
  { agentId: AGENT_ID, status: "paid", amount: 300, rate: 15, type: "placement", currency: "AED", month: 4 },
  { agentId: AGENT_ID, status: "paid", amount: 200, rate: 10, type: "placement", currency: "AED", month: 4 },
  // No rate on file: counts toward totals, not toward the average.
  { agentId: AGENT_ID, status: "approved", amount: 50, type: "placement", currency: "AED", month: 5 },
];

jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: {
    aggregate: jest.fn(async (pipeline: Stage[]) => {
      const group = pipeline.find((s) => s.$group)?.$group;
      const id = group?._id;
      const rows = COMMISSIONS;
      if (id === "$currency") return [{ _id: "AED", total: 650, count: 4 }];
      if (id === "$type") return [{ _id: "placement", amount: 650, count: 4 }];
      if (id === null) {
        const rated = rows.filter((r) => typeof r.rate === "number");
        return [{ _id: null, avgRate: rated.reduce((s, r) => s + (r.rate ?? 0), 0) / rated.length, count: rated.length }];
      }
      const key = id as Record<string, string>;
      const buckets = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = key.agentId ? `${r.agentId}|${r.status}` : `${r.month}|${r.status}`;
        buckets.set(k, [...(buckets.get(k) ?? []), r]);
      }
      return [...buckets.entries()].map(([k, list]) => {
        const [first, status] = k.split("|");
        const rated = list.filter((r) => typeof r.rate === "number");
        return {
          _id: key.agentId ? { agentId: first, status } : { month: Number(first), status },
          total: list.reduce((s, r) => s + r.amount, 0),
          count: list.length,
          rateSum: rated.reduce((s, r) => s + (r.rate ?? 0), 0),
          rateCount: rated.length,
          avgRate: rated.length ? rated.reduce((s, r) => s + (r.rate ?? 0), 0) / rated.length : null,
        };
      });
    }),
  },
}));

function leanFind(docs: unknown[]) {
  return { select: () => ({ lean: () => Promise.resolve(docs) }) };
}

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { find: jest.fn(() => leanFind([{ _id: AGENT_ID, userId: AGENT_USER_ID, superAgentId: null }])) },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { find: jest.fn(() => leanFind([])) },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: { _id: { $in: string[] } }) =>
      leanFind(filter._id.$in.map(String).includes(AGENT_USER_ID) ? [{ _id: AGENT_USER_ID, name: "Rate Agent", email: "rate@example.test" }] : []),
    ),
  },
}));

import { GET } from "@/app/api/admin/commissions-report/route";

describe("GET /api/admin/commissions-report — per-agent average rate", () => {
  it("averages the rate over every rated commission, across status groups", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/commissions-report?year=2026"), {} as never);
    const body = await res.json();
    const agent = body.agentBreakdown.find((a: { agentId: string }) => a.agentId === AGENT_ID);

    expect(agent).toMatchObject({ total: 650, count: 4, pending: 100, approved: 50, paid: 500, avgRate: 10 });
    // Internal accumulators stay out of the response.
    expect(agent).not.toHaveProperty("rateSum");
    expect(agent).not.toHaveProperty("rateCount");
    // Same basis as the summary card.
    expect(body.summary.avgRate).toBe(10);
  });
});
