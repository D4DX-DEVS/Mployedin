/**
 * @jest-environment node
 *
 * The agent's "Scheduled interviews" count only matched `status: "scheduled"`,
 * so an interview stopped counting the moment the candidate confirmed it —
 * the confirmed ones are the most certain to happen (audit FUNC-014).
 */
import { NextRequest } from "next/server";

const USER_ID = "650000000000000000000a01";
const AGENT_ID = "650000000000000000000a02";

const interviewCounts: Array<Record<string, unknown>> = [];
const model = (name: string) => {
  const chain = (value: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "sort", "limit", "populate", "skip"]) c[m] = () => c;
    c.lean = async () => value;
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(value).then(res);
    return c;
  };
  return {
    countDocuments: jest.fn(async (filter: Record<string, unknown>) => {
      if (name === "Interview") interviewCounts.push(filter);
      return 0;
    }),
    aggregate: jest.fn(async () => []),
    find: jest.fn(() => chain([])),
    findOne: jest.fn(() => chain(name === "Agent" ? { _id: AGENT_ID, performance: {}, commissionRate: 0 } : null)),
  };
};

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) => handler(req, { userId: USER_ID, role: "agent", locale: "en" }),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getAgentEmployerIds: jest.fn(async () => []) }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: model("Agent") }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: model("Job") }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: model("Application") }));
jest.mock("@/models/Lead", () => ({ __esModule: true, default: model("Lead") }));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: model("Placement") }));
jest.mock("@/models/Commission", () => ({ __esModule: true, default: model("Commission") }));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: model("Interview") }));
jest.mock("@/models/Offer", () => ({ __esModule: true, default: model("Offer") }));

const statusCount = () => interviewCounts.find((f) => "status" in f);

beforeEach(() => { interviewCounts.length = 0; });

describe("agent Scheduled interviews count", () => {
  it.each([
    ["/api/agent/analytics", () => import("@/app/api/agent/analytics/route")],
    ["/api/agent/dashboard", () => import("@/app/api/agent/dashboard/route")],
  ])("%s counts confirmed interviews as well as scheduled ones", async (url, load) => {
    const { GET } = await load();
    const res = await (GET as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest(`http://localhost${url}`));

    expect(res.status).toBe(200);
    expect(statusCount()).toEqual({ agentId: AGENT_ID, status: { $in: ["scheduled", "confirmed"] } });
  });
});
