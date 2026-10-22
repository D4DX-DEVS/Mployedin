/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

/**
 * ?jobSeekerId= (a task linked to a candidate opens their applications) may
 * only narrow what the caller already sees. A job seeker's own scope is
 * query.jobSeekerId, so the filter must be ANDed beside it, never written over
 * it — overwriting would list another seeker's applications.
 */

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const OWN_SEEKER = "64b0000000000000000000a1";
const OTHER_SEEKER = "64b0000000000000000000a2";
const EMPLOYER_ID = "64b000000000000000000001";
const JOB_ID = "64b000000000000000000002";

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: OWN_SEEKER }) }) })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: EMPLOYER_ID }) }) })) },
}));
jest.mock("@/models/CompanyUser", () => ({
  __esModule: true,
  CompanyUser: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ select: () => ({ lean: async () => [{ _id: JOB_ID }] }) })) },
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentEmployerIds: jest.fn(async () => []) }));

let applicationQueries: Array<Record<string, unknown>> = [];
function chain() {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "select", "populate"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => []);
  return c;
}
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn((query: Record<string, unknown>) => {
      applicationQueries.push(query);
      return chain();
    }),
    countDocuments: jest.fn(async () => 0),
  },
}));

const call = async (url: string, role: string) => {
  const { getHandler } = await import("@/app/api/applications/handlers");
  return getHandler(new NextRequest(`http://localhost:3000${url}`, { method: "GET" }), { userId: "u1", role, locale: "en" } as never);
};

const ids = (q: Record<string, unknown>) =>
  ((q.$and as Array<Record<string, unknown>> | undefined) ?? []).map((c) => String(c.jobSeekerId));

describe("GET /api/applications — ?jobSeekerId", () => {
  beforeEach(() => {
    applicationQueries = [];
    jest.clearAllMocks();
  });

  it("keeps a job seeker on their own applications when they pass someone else's id", async () => {
    await call(`/api/applications?jobSeekerId=${OTHER_SEEKER}`, "job_seeker");
    const q = applicationQueries[0];
    expect(String(q.jobSeekerId)).toBe(OWN_SEEKER);
    expect(ids(q)).toContain(OTHER_SEEKER); // ANDed: the two together match nothing
  });

  it("narrows an employer's list to that candidate, inside the employer's job scope", async () => {
    await call(`/api/applications?jobSeekerId=${OTHER_SEEKER}`, "employer");
    const q = applicationQueries[0];
    expect(q.jobId).toEqual({ $in: [JOB_ID] });
    expect(ids(q)).toEqual([OTHER_SEEKER]);
  });

  it("ignores a malformed id", async () => {
    await call(`/api/applications?jobSeekerId=not-an-id`, "employer");
    expect(applicationQueries[0].$and).toBeUndefined();
  });
});
