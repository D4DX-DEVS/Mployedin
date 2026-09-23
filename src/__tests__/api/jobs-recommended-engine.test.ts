/**
 * @jest-environment node
 *
 * /api/jobs/recommended feeds the jobs feed, the home page's client fallback
 * and the MCP tool. The feed is a browse list — every job, scored by the
 * engine — but anything asking for recommendations (`recommended=true`) gets
 * only what the engine recommends, with no "show something anyway" fallback:
 * an empty answer is the truthful one, and the page explains it.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["select", "populate", "sort", "limit", "skip"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  c.then = jest.fn((resolve: (v: T) => unknown) => Promise.resolve(result).then(resolve));
  return c;
}

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => chain({ _id: "s1", preferredCountries: ["India"] })) },
}));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { find: jest.fn(() => chain([])) } }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(async () => 3), find: jest.fn(() => chain([])) },
}));
jest.mock("@/lib/effectiveSeekerProfile", () => ({ effectiveSeekerProfile: async () => ({ skills: [] }) }));

type PoolJob = { _id: string; matchScore: number; sortScore: number; recommended: boolean; eligible: boolean; createdAt: string };
let mockPool: {
  jobs: PoolJob[];
  threshold: number;
  recommendedCount: number;
  eligibleCount: number;
  bestScore: number;
  limitingFactor?: string;
};
jest.mock("@/lib/matching/seekerMatches", () => ({ scoreSeekerPool: async () => mockPool }));

const now = new Date().toISOString();
const pj = (id: string, score: number, recommended: boolean, eligible = true): PoolJob => ({
  _id: id,
  matchScore: score,
  sortScore: eligible ? score : score - 20,
  recommended,
  eligible,
  createdAt: now,
});

async function get(query: string) {
  const { getHandler } = await import("@/app/api/jobs/recommended/handlers");
  const res = await getHandler(new NextRequest(`http://localhost/api/jobs/recommended?${query}`), {
    userId: "u1",
    role: "job_seeker",
    locale: "en",
  });
  return res.json();
}

beforeEach(() => {
  mockPool = {
    jobs: [pj("a", 91, true), pj("b", 84, true), pj("c", 67, false), pj("d", 95, false, false)],
    threshold: 80,
    recommendedCount: 2,
    eligibleCount: 3,
    bestScore: 91,
  };
});

describe("GET /api/jobs/recommended", () => {
  it("returns the whole scored pool for the feed, with the engine's verdict on each job", async () => {
    const body = await get("limit=10");
    expect(body.jobs.map((j: PoolJob) => j._id)).toEqual(["a", "b", "c", "d"]);
    expect(body.jobs.map((j: PoolJob) => j.recommended)).toEqual([true, true, false, false]);
  });

  it("returns recommended jobs only when asked for recommendations", async () => {
    const body = await get("limit=4&sort=match&recommended=true");
    expect(body.jobs.map((j: PoolJob) => j._id)).toEqual(["a", "b"]);
  });

  it("does not pad an empty recommendation list with weaker jobs", async () => {
    mockPool = {
      ...mockPool,
      jobs: [pj("c", 67, false)],
      recommendedCount: 0,
      bestScore: 67,
      limitingFactor: "score",
    };
    const body = await get("limit=4&recommended=true");
    expect(body.jobs).toEqual([]);
    expect(body).toMatchObject({ threshold: 80, bestScore: 67, limitingFactor: "score", strongMatches: 0 });
  });

  it("counts strong matches as the jobs it recommends, not as a local 80% cut", async () => {
    // "d" scores 95 but fails a gate; the old count included it.
    const body = await get("limit=10");
    expect(body.strongMatches).toBe(2);
    expect(body.matchedCount).toBe(3);
    expect(body.limitingFactor).toBeNull();
  });
});
