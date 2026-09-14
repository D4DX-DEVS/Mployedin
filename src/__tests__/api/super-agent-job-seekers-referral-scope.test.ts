/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
let ctxRole = "super_agent";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (...args: unknown[]) => unknown) =>
    async (req: NextRequest) =>
      handler(req, { userId: "sa_user_1", role: ctxRole, locale: "en" }),
}));
jest.mock("@/lib/referrals/summary", () => ({
  decorateReferralSummaries: jest.fn(async (items: unknown[]) => items),
}));

const SA_DOC = "670000000000000000000001";
const TEAM_AGENT = "670000000000000000000002";
const ASSIGNED_SEEKER = "670000000000000000000003";

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: SA_DOC }) }) })) },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ select: () => ({ lean: async () => [{ assignedJobSeekerIds: [ASSIGNED_SEEKER] }] }) })),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ lean: async () => [{ _id: "u1" }] })) },
}));

const scope = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: (...a: unknown[]) => scope(...a) }));

const filters: unknown[] = [];
const distinctFilters: unknown[] = [];
function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "populate", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn((f: unknown) => { filters.push(f); return chain([]); }),
    countDocuments: jest.fn(async () => 0),
    distinct: jest.fn(async (_field: string, f: unknown) => { distinctFilters.push(f); return []; }),
    /* The header figures read the same collection a fourth time; its `$match`
       carries the list's scope. */
    aggregate: jest.fn(async (pipeline: Array<Record<string, unknown>>) => {
      filters.push((pipeline[0] as { $match?: unknown })?.$match);
      return [];
    }),
  },
}));

async function list(qs = "") {
  const { GET } = await import("@/app/api/super-agent/job-seekers/route");
  return GET(new NextRequest(`http://localhost:3888/api/super-agent/job-seekers?${qs}`), {
    params: Promise.resolve({}),
  });
}
const lastFilter = () => JSON.stringify(filters[filters.length - 1]);

describe("GET /api/super-agent/job-seekers — referral scoping", () => {
  beforeEach(() => {
    filters.length = 0;
    distinctFilters.length = 0;
    jest.clearAllMocks();
    scope.mockResolvedValue({ effectiveAgentIds: [TEAM_AGENT] });
    ctxRole = "super_agent";
  });

  it("unions team assignments, team referrals and the super-agent's own referrals", async () => {
    await list();
    const f = lastFilter();
    expect(f).toContain(`"_id":{"$in":["${ASSIGNED_SEEKER}"]}`);
    expect(f).toContain(`"referral.agentId":{"$in":["${TEAM_AGENT}"]}`);
    expect(f).toContain(`"referral.superAgentId":"${SA_DOC}"`);
  });

  it("keeps the scope when a search is also applied", async () => {
    await list("search=sara");
    const f = JSON.parse(lastFilter()) as { $and: Array<Record<string, unknown>> };
    // Two separate $or clauses: the scope and the search. One object cannot
    // hold both, which is why they live in an $and.
    expect(f.$and).toHaveLength(2);
    expect(JSON.stringify(f.$and[0])).toContain("referral.superAgentId");
    expect(JSON.stringify(f.$and[1])).toContain("skills");
  });

  it("gives the country facet the same scope as the list", async () => {
    await list();
    expect(JSON.stringify(distinctFilters[0])).toContain(`"referral.superAgentId":"${SA_DOC}"`);
  });

  it("leaves an admin unscoped", async () => {
    ctxRole = "admin";
    await list();
    expect(lastFilter()).toBe("{}");
    expect(distinctFilters[0]).toEqual({});
  });
});
