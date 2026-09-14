/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const EMPLOYER_USER = "emp_user_1";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) => async (req: NextRequest) =>
    handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }),
}));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));

const EMPLOYER_ID = "64b000000000000000000001";
const JOB_ID = "64b000000000000000000002";

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

const sorts: Array<Record<string, number>> = [];
const queries: Array<Record<string, unknown>> = [];
function chain() {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["skip", "limit", "select", "populate"]) c[m] = jest.fn(() => c);
  c.sort = jest.fn((s: Record<string, number>) => { sorts.push(s); return c; });
  c.lean = jest.fn(async () => []);
  return c;
}
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn((q: Record<string, unknown>) => { queries.push(q); return chain(); }),
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
  },
}));

// Everything else the handler imports loads for real without a DB, exactly as in
// src/__tests__/api/applications-unreviewed.test.ts. With an empty result set
// none of the enrichment queries run.

async function list(qs: string) {
  const { getHandler } = await import("@/app/api/applications/handlers");
  const { withAuth } = await import("@/lib/auth/withAuth");
  const wrapped = withAuth(getHandler) as unknown as (req: NextRequest) => Promise<Response>;
  return wrapped(new NextRequest(`http://localhost:3888/api/applications?${qs}`));
}

describe("GET /api/applications — referred candidates first", () => {
  beforeEach(() => { sorts.length = 0; queries.length = 0; });

  it("prefixes the default (newest) sort with isAgentReferred", async () => {
    await list(`jobId=${JOB_ID}`);
    expect(sorts[0]).toEqual({ isAgentReferred: -1, appliedAt: -1 });
  });

  it("keeps oldest-first but still referred-first", async () => {
    await list(`jobId=${JOB_ID}&sortBy=appliedAt&sortOrder=asc`);
    expect(sorts[0]).toEqual({ isAgentReferred: -1, appliedAt: 1 });
  });

  it("leaves the best-match order untouched", async () => {
    await list(`jobId=${JOB_ID}&sortBy=aiMatchScore`);
    expect(sorts[0]).toEqual({ aiMatchScore: -1 });
  });

  it("filters to referred candidates with referred=true", async () => {
    await list(`jobId=${JOB_ID}&referred=true`);
    expect(queries[0].isAgentReferred).toBe(true);
    await list(`jobId=${JOB_ID}`);
    expect(queries[1].isAgentReferred).toBeUndefined();
  });
});
