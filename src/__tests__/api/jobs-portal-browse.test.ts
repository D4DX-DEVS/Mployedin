/**
 * @jest-environment node
 *
 * GET /api/jobs?scope=portal — the agent's Browse jobs page (2026-10-13):
 *  - `posted=week` narrows to jobs created in the last 7 days.
 *  - `facets=1` returns the portal total, the new-this-week count, and one
 *    industry entry per spelling ("technology" / "Technology") with the live
 *    job count summed across spellings.
 *  - `industry=` matches every spelling that shares the key, so a chip's count
 *    and the list it opens agree.
 */
import { NextRequest } from "next/server";
import { Types } from "mongoose";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { api: {}, jobCreate: {} },
}));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn() }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/CompanyUser", () => ({ CompanyUser: { findOne: jest.fn() } }));
jest.mock("@/models/Application", () => ({
  Application: { aggregate: jest.fn().mockResolvedValue([]), countDocuments: jest.fn().mockResolvedValue(0) },
}));
jest.mock("@/models/ExtractionDraft", () => ({ ExtractionDraft: {} }));

const TECH_A = new Types.ObjectId();
const TECH_B = new Types.ObjectId();
const BUILD = new Types.ObjectId();

const employerFind = jest.fn();
jest.mock("@/models/Employer", () => ({
  Employer: {
    find: (...a: unknown[]) => {
      employerFind(...a);
      return {
        select: () => ({
          lean: () =>
            Promise.resolve([
              { _id: TECH_A, industry: "technology" },
              { _id: TECH_B, industry: "Technology" },
              { _id: BUILD, industry: "human_resources" },
            ]),
          limit: () => ({ lean: () => Promise.resolve([{ _id: TECH_A }, { _id: TECH_B }]) }),
        }),
      };
    },
  },
}));

const jobCount = jest.fn();
const jobAggregate = jest.fn();
function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["sort", "skip", "limit", "populate", "select"]) c[m] = () => c;
  c.lean = () => Promise.resolve([]);
  return c;
}
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    find: () => chain(),
    countDocuments: (...a: unknown[]) => jobCount(...a),
    aggregate: (...a: unknown[]) => jobAggregate(...a),
    distinct: jest.fn().mockResolvedValue([]),
  },
}));

import { getHandler } from "@/app/api/jobs/handlers";

const ctx = { userId: "aaaaaaaaaaaaaaaaaaaaaaaa", role: "agent" as const, locale: "en" };
const get = (qs: string) => getHandler(new NextRequest(`http://localhost/api/jobs?scope=portal&${qs}`), ctx);

beforeEach(() => {
  jest.clearAllMocks();
  jobCount.mockResolvedValue(0);
  jobAggregate.mockResolvedValue([]);
});

it("posted=week keeps only jobs created in the last 7 days", async () => {
  const before = Date.now();
  await get("posted=week");
  const query = jobCount.mock.calls[0][0] as { createdAt?: { $gte: Date }; status?: string };
  expect(query.status).toBe("active");
  const since = query.createdAt?.$gte.getTime() ?? 0;
  expect(before - since).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
  expect(before - since).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 60_000);
});

it("ignores any other posted value", async () => {
  await get("posted=all");
  expect((jobCount.mock.calls[0][0] as Record<string, unknown>).createdAt).toBeUndefined();
});

it("facets carry the portal total, new-this-week, and industry counts summed across spellings", async () => {
  jobAggregate.mockImplementation(async (pipeline: Array<Record<string, unknown>>) =>
    "$group" in (pipeline[1] ?? {})
      ? [
          { _id: TECH_A, count: 4 },
          { _id: TECH_B, count: 5 },
          { _id: BUILD, count: 2 },
        ]
      : [],
  );
  // Calls: list total, then the facet counts (new this week, then all active).
  jobCount.mockImplementation(async (q: { createdAt?: unknown }) => (q.createdAt ? 3 : 11));
  const res = await get("facets=1");
  const body = await res.json();
  expect(body.facets.newThisWeek).toBe(3);
  expect(body.facets.totalActive).toBe(11);
  expect(body.facets.industries).toEqual([
    { value: "human_resources", label: "Human resources", count: 2 },
    { value: "technology", label: "Technology", count: 9 },
  ]);
});

it("industry= matches every spelling of the same industry", async () => {
  await get("industry=Human%20Resources");
  const pattern = (employerFind.mock.calls[0][0] as { industry: RegExp }).industry;
  expect(pattern.test("human_resources")).toBe(true);
  expect(pattern.test("Human Resources")).toBe(true);
  expect(pattern.test("Human Resources Consulting")).toBe(false);
});
