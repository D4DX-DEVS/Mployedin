/**
 * @jest-environment node
 *
 * The agent's Job Seekers page heads its list with three numbers — complete
 * profiles, average profile, profiles with a current job title. They used to
 * be counted from the 10 rows on screen while the header said "189 profiles".
 * `?stats=1` has the list route count them over the whole filtered list,
 * with the same scope as the rows; callers that don't ask pay nothing.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (...args: unknown[]) => unknown) =>
    async (req: NextRequest) =>
      handler(req, { userId: "staff_1", role: "agent", locale: "en" }),
}));
jest.mock("@/lib/referrals/summary", () => ({ decorateReferralSummaries: jest.fn(async (items: unknown[]) => items) }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { aggregate: jest.fn(async () => []) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { collection: { name: "users" } } }));

const AGENT_DOC = "660000000000000000000001";
const CITY = "550000000000000000000001";
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      select: () => ({
        lean: async () => ({ _id: AGENT_DOC, assignedJobSeekerIds: [], assignedCityIds: [CITY], assignedStateIds: [] }),
      }),
    })),
  },
}));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/lib/auth/agentRestrictions", () => {
  const actual = jest.requireActual("@/lib/auth/agentRestrictions");
  return {
    ...actual,
    getAgentSeekerArea: async (a: { assignedCityIds?: string[] }) => ({ assignedCityIds: a.assignedCityIds ?? [], assignedStateIds: [] }),
  };
});

const findFilters: unknown[] = [];
const aggregate = jest.fn(async (_pipeline: unknown[]): Promise<unknown[]> => []);
function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn((f: unknown) => { findFilters.push(f); return chain([]); }),
    countDocuments: jest.fn(async () => 189),
    aggregate: (p: unknown[]) => aggregate(p),
  },
}));

import { readSeekerListStats, SEEKER_LIST_STATS_STAGES } from "@/lib/jobseekers/listStats";

async function list(qs = "") {
  const { GET } = await import("@/app/api/job-seekers/route");
  const res = await GET(new NextRequest(`http://localhost:3888/api/job-seekers?${qs}`), { params: Promise.resolve({}) });
  return res.json();
}

beforeEach(() => {
  findFilters.length = 0;
  aggregate.mockReset();
  aggregate.mockImplementation(async () => []);
});

describe("readSeekerListStats", () => {
  it("rounds the average and reads the counts", () => {
    expect(readSeekerListStats({ complete: 3, avgCompleteness: 47.5, withTitles: 6 })).toEqual({
      complete: 3, avgCompleteness: 48, withTitles: 6,
    });
  });

  it("an empty list counts as zero, never NaN", () => {
    expect(readSeekerListStats(undefined)).toEqual({ complete: 0, avgCompleteness: 0, withTitles: 0 });
    expect(readSeekerListStats({ complete: null, avgCompleteness: null, withTitles: null })).toEqual({
      complete: 0, avgCompleteness: 0, withTitles: 0,
    });
  });
});

describe("GET /api/job-seekers?stats=1", () => {
  it("without stats=1 the route runs no extra query and sends no stats", async () => {
    const body = await list();
    expect(aggregate).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty("stats");
  });

  it("counts over the same scoped filter as the rows, not the page", async () => {
    aggregate.mockImplementation(async () => [{ complete: 2, avgCompleteness: 40.4, withTitles: 6 }]);
    const body = await list("stats=1&page=1&limit=10");
    expect(aggregate).toHaveBeenCalledTimes(1);
    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({ $match: findFilters[0] });
    expect(pipeline.slice(1)).toEqual(SEEKER_LIST_STATS_STAGES);
    // no $skip / $limit: the whole list, not one page
    expect(JSON.stringify(pipeline)).not.toMatch(/\$skip|\$limit/);
    expect(body.stats).toEqual({ complete: 2, avgCompleteness: 40, withTitles: 6 });
    expect(body.total).toBe(189);
  });

  it("no matching seekers gives zeros", async () => {
    const body = await list("stats=1&view=area");
    expect(body.stats).toEqual({ complete: 0, avgCompleteness: 0, withTitles: 0 });
  });

  it("a searched list counts the searched set inside the same aggregate", async () => {
    aggregate.mockImplementation(async () => [{
      items: [], count: [{ total: 4 }], stats: [{ complete: 1, avgCompleteness: 62.6, withTitles: 2 }],
    }]);
    const body = await list("stats=1&search=driver");
    expect(aggregate).toHaveBeenCalledTimes(1);
    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline.find((s) => "$facet" in s)?.$facet as Record<string, unknown>;
    expect(facet.stats).toEqual(SEEKER_LIST_STATS_STAGES);
    expect(body.stats).toEqual({ complete: 1, avgCompleteness: 63, withTitles: 2 });
    expect(body.total).toBe(4);
  });

  it("a searched list without stats=1 has no stats branch", async () => {
    aggregate.mockImplementation(async () => [{ items: [], count: [] }]);
    const body = await list("search=driver");
    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline.find((s) => "$facet" in s)?.$facet as Record<string, unknown>;
    expect(facet).not.toHaveProperty("stats");
    expect(body).not.toHaveProperty("stats");
  });
});
