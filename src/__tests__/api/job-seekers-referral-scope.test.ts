/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
let ctxRole = "agent";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (...args: unknown[]) => unknown) =>
    async (req: NextRequest) =>
      handler(req, { userId: "staff_1", role: ctxRole, locale: "en" }),
}));
jest.mock("@/lib/referrals/summary", () => ({ decorateReferralSummaries: jest.fn(async (items: unknown[]) => items) }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { collection: { name: "users" } } }));

const AGENT_DOC = "660000000000000000000001";
const SA_DOC = "660000000000000000000002";
const TEAM_AGENT = "660000000000000000000003";

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: AGENT_DOC, assignedJobSeekerIds: [] }) }) })) },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: SA_DOC }) }) })) },
}));
const scope = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: (...a: unknown[]) => scope(...a) }));

const filters: unknown[] = [];
let seekerExists = false;
function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    exists: jest.fn(async () => seekerExists),
    find: jest.fn((f: unknown) => { filters.push(f); return chain([]); }),
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => [{ items: [], count: [] }]),
  },
}));

async function list(qs = "") {
  const { GET } = await import("@/app/api/job-seekers/route");
  return GET(new NextRequest(`http://localhost:3888/api/job-seekers?${qs}`), { params: Promise.resolve({}) });
}
const cond = () => JSON.stringify(filters[filters.length - 1]);

describe("GET /api/job-seekers — referral scoping", () => {
  beforeEach(() => { filters.length = 0; seekerExists = false; jest.clearAllMocks(); });

  it("agent with assignments also sees seekers they referred", async () => {
    ctxRole = "agent"; seekerExists = true;
    await list();
    expect(cond()).toContain(`"referral.agentId":"${AGENT_DOC}"`);
  });

  // An agent with no assignments used to get NO scope at all: every seeker on
  // the platform, including ones who hid their profile — and the detail route
  // then 403'd on all of them.
  it("agent with no assignments still sees only their own seekers", async () => {
    ctxRole = "agent"; seekerExists = false;
    await list();
    const c = cond();
    expect(c).toContain(`"agentId":"${AGENT_DOC}"`);
    expect(c).toContain(`"referral.agentId":"${AGENT_DOC}"`);
  });

  it("agent with no Agent profile sees nothing", async () => {
    ctxRole = "agent";
    const Agent = (await import("@/models/Agent")).default as unknown as { findOne: jest.Mock };
    Agent.findOne.mockImplementationOnce(() => ({ select: () => ({ lean: async () => null }) }));
    await list();
    expect(cond()).toContain(`"_id":{"$in":[]}`);
  });

  it("agent referred=mine narrows to their own referrals", async () => {
    ctxRole = "agent";
    await list("referred=mine");
    expect(cond()).toContain(`"referral.agentId":"${AGENT_DOC}"`);
  });

  it("super-agent scope is team agents' assignments ∪ team referrals ∪ own referrals", async () => {
    ctxRole = "super_agent";
    scope.mockResolvedValue({ effectiveAgentIds: [TEAM_AGENT] });
    await list();
    const c = cond();
    expect(c).toContain(`"agentId":{"$in":["${TEAM_AGENT}"]}`);
    expect(c).toContain(`"referral.agentId":{"$in":["${TEAM_AGENT}"]}`);
    expect(c).toContain(`"referral.superAgentId":"${SA_DOC}"`);
  });

  it("super-agent with an empty scope still sees nothing beyond their own referrals", async () => {
    ctxRole = "super_agent";
    scope.mockResolvedValue({ effectiveAgentIds: [] });
    await list();
    expect(cond()).toContain(`"agentId":{"$in":[]}`);
    expect(cond()).toContain(`"referral.superAgentId":"${SA_DOC}"`);
  });

  it("admin referred filter values map to conditions", async () => {
    ctxRole = "admin";
    await list("referred=agent");
    expect(cond()).toContain(`"referral.referrerRole":"agent"`);
    await list("referred=super_agent");
    expect(cond()).toContain(`"referral.referrerRole":"super_agent"`);
    await list("referred=any");
    expect(cond()).toContain(`"isAgentReferred":true`);
    await list("referred=none");
    expect(cond()).toContain(`"isAgentReferred":{"$ne":true}`);
    await list("referred=bogus");
    expect(cond()).not.toContain("isAgentReferred");
  });
});
