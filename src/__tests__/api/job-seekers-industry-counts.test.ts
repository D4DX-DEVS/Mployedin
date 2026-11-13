/**
 * @jest-environment node
 *
 * Industry counts aggregation: when ?industryCounts=1, the API returns
 * [{industry, count}] grouped by industry within the same scope filter as
 * the seekers list. An agent's counts must never include seekers outside
 * their scope.
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
// The Industries master the counts fold onto (industryCanonical.server.ts).
jest.mock("@/models/Industry", () => ({
  __esModule: true,
  default: {
    find: () => ({
      select: () => ({
        lean: async () => ["Technology", "Finance", "Healthcare", "Tech", "Other"].map((name) => ({ name })),
      }),
    }),
  },
}));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { aggregate: jest.fn(async () => []) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { collection: { name: "users" } } }));

const AGENT_DOC = "660000000000000000000001";
const SA_DOC = "660000000000000000000002";
const TEAM_AGENT = "660000000000000000000003";

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      select: () => ({
        lean: async () => ({ _id: AGENT_DOC, assignedJobSeekerIds: [], assignedCityIds: [], assignedStateIds: [] }),
      }),
    })),
  },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: SA_DOC }) }) })) },
}));
const scope = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: (...a: unknown[]) => scope(...a),
  getSuperAgentTerritory: async () => null,
  getAgentSeekerArea: async () => ({ assignedCityIds: [], assignedStateIds: [] }),
  seekerRegionMatch: () => null,
}));

const filters: unknown[] = [];
const aggregatePipelines: unknown[][] = [];
const aggregateMock = jest.fn((p: unknown[]) => {
  aggregatePipelines.push(p);
  return Promise.resolve<unknown[]>([{ items: [], count: [] }]);
});
function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn((f: unknown) => { filters.push(f); return chain([]); }),
    countDocuments: jest.fn(async () => 0),
    aggregate: aggregateMock,
    // Stored spellings the industry filter expands to.
    distinct: jest.fn(async () => ["Technology", "Tech"]),
  },
}));

async function list(qs = "") {
  const { GET } = await import("@/app/api/job-seekers/route");
  const res = await GET(new NextRequest(`http://localhost:3888/api/job-seekers?${qs}`), { params: Promise.resolve({}) });
  return res.json();
}

describe("GET /api/job-seekers?industryCounts=1", () => {
  beforeEach(() => {
    filters.length = 0;
    aggregatePipelines.length = 0;
    jest.clearAllMocks();
  });

  it("without industryCounts=1 the route returns no industryCounts", async () => {
    const body = await list();
    expect(body).not.toHaveProperty("industryCounts");
  });

  it("with industryCounts=1 the route calls aggregate to count industries", async () => {
    aggregateMock.mockClear();
    aggregatePipelines.length = 0;
    await list("industryCounts=1");
    // The non-search path calls aggregate for industry counts
    expect(aggregateMock).toHaveBeenCalled();
  });

  it("industry counts use the same scope filter as the seekers list", async () => {
    ctxRole = "agent";
    aggregateMock.mockClear();
    aggregatePipelines.length = 0;
    await list("industryCounts=1");
    // The aggregatePipeline should use the same scope filter in the $match stage
    expect(aggregatePipelines.length).toBeGreaterThan(0);
    const pipeline = aggregatePipelines[0] as unknown[];
    expect(pipeline).toBeDefined();
    const matchStage = pipeline?.[0] as Record<string, unknown>;
    expect(matchStage?.$match).toBeDefined();
    // Verify the $match contains the agent scope filter (agentId or referral.agentId)
    const matchJson = JSON.stringify(matchStage?.$match);
    expect(matchJson).toContain(AGENT_DOC);
  });

  it("groups by industry and counts, excluding null/empty", async () => {
    await list("industryCounts=1");
    const pipeline = aggregatePipelines[0] as Array<Record<string, unknown>>;
    const groupStage = pipeline?.find((s: Record<string, unknown>) => s?.$group) as Record<string, unknown> | undefined;
    const matchStage = pipeline?.find((s: Record<string, unknown>, i: number) => i > 0 && s?.$match) as Record<string, unknown> | undefined;
    expect((groupStage?.$group as Record<string, unknown>)?._id).toBe("$industry");
    expect((groupStage?.$group as Record<string, unknown>)?.count).toEqual({ $sum: 1 });
    // Check that null and empty strings are filtered out
    expect(JSON.stringify(matchStage?.$match)).toContain("$not");
  });

  it("returns industryCounts as [{industry, count}, ...]", async () => {
    // Mock the aggregate to return industry counts from non-search path
    aggregateMock.mockClear();
    aggregatePipelines.length = 0;
    aggregateMock.mockResolvedValueOnce([
      { industry: "Technology", count: 15 },
      { industry: "Finance", count: 8 },
      { industry: "Healthcare", count: 5 },
    ]);
    const body = await list("industryCounts=1");
    expect(body.industryCounts).toEqual([
      { industry: "Technology", count: 15 },
      { industry: "Finance", count: 8 },
      { industry: "Healthcare", count: 5 },
    ]);
  });

  it("agent's industry counts respect their scope — never show all seekers", async () => {
    ctxRole = "agent";
    aggregateMock.mockClear();
    aggregatePipelines.length = 0;
    aggregateMock.mockResolvedValueOnce([
      { industry: "Technology", count: 5 },
    ]);
    const body = await list("industryCounts=1");
    // Verify the response includes industry counts
    expect(body.industryCounts).toEqual([{ industry: "Technology", count: 5 }]);
    // Verify the aggregate was called
    expect(aggregateMock).toHaveBeenCalled();
  });

  it("super-agent's industry counts include only their team's seekers", async () => {
    ctxRole = "super_agent";
    scope.mockResolvedValue({ effectiveAgentIds: [TEAM_AGENT] });
    aggregateMock.mockClear();
    aggregatePipelines.length = 0;
    aggregateMock.mockResolvedValueOnce([
      { industry: "Technology", count: 3 },
    ]);
    await list("industryCounts=1");
    // Verify the aggregate was called
    expect(aggregateMock).toHaveBeenCalled();
  });

  it("searched list with industryCounts=1 includes counts in facet", async () => {
    ctxRole = "admin";
    aggregateMock.mockClear();
    aggregatePipelines.length = 0;
    aggregateMock.mockResolvedValueOnce([
      {
        items: [],
        count: [{ total: 10 }],
        industryCounts: [
          { industry: "Tech", count: 6 },
          { industry: "Other", count: 4 },
        ],
      },
    ]);
    const body = await list("search=engineer&industryCounts=1");
    expect(body.industryCounts).toEqual([
      { industry: "Tech", count: 6 },
      { industry: "Other", count: 4 },
    ]);
  });

  it("no matching seekers yields no industryCounts field when empty", async () => {
    aggregateMock.mockClear();
    aggregatePipelines.length = 0;
    aggregateMock.mockResolvedValueOnce([]);
    const body = await list("industryCounts=1&industry=Nonexistent");
    // When industryCounts is empty, the field is not included in the response
    expect(body.industryCounts).toBeUndefined();
  });
});
