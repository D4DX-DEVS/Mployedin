/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

// QA 2026-10-01: the seeker's Applications search box ("Search by job title or
// company") also matched the candidate fields staff search on — name, skills,
// location, past job titles. Those fields belong to the seeker themself, so a
// term from their own profile ("React") returned every application they own.

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const SEEKER_USER = "seeker_user_1";
const EMPLOYER_USER = "emp_user_1";
const SEEKER_ID = "64b0000000000000000000a1";
const EMPLOYER_ID = "64b000000000000000000001";
const JOB_ID = "64b000000000000000000002";

let role: "job_seeker" | "employer" = "job_seeker";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) => async (req: NextRequest) =>
    handler(req, { userId: role === "job_seeker" ? SEEKER_USER : EMPLOYER_USER, role, locale: "en" }),
}));

// The seeker's own profile matches every search term these tests send.
const seekerFind = jest.fn(() => ({ select: () => ({ lean: async () => [{ _id: SEEKER_ID }] }) }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: SEEKER_ID }) }) })),
    find: (...args: unknown[]) => seekerFind(...(args as [])),
  },
}));

const userFind = jest.fn(() => ({ select: () => ({ lean: async () => [] }) }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...args: unknown[]) => userFind(...(args as [])) },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));

// Company search hits an employer only when the term is "d4dx".
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: EMPLOYER_ID }) }) })),
    find: jest.fn((q: { companyName?: { $regex?: string } }) => {
      const rows = /d4dx/i.test(q.companyName?.$regex ?? "") ? [{ _id: EMPLOYER_ID }] : [];
      return { select: () => ({ lean: async () => rows }) };
    }),
  },
}));

jest.mock("@/models/CompanyUser", () => ({
  __esModule: true,
  CompanyUser: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));

// Title search hits a job only when the term is "Accountant"; the employer
// lookup (company search) and the employer's scope lookup always return it.
const COMPANY_JOB_ID = "64b000000000000000000003";
const jobFind = jest.fn((q: Record<string, unknown>) => {
  const title = (q.title as { $regex?: string } | undefined)?.$regex;
  const byEmployer = (q.employerId as { $in?: unknown[] } | undefined)?.$in;
  const rows = byEmployer
    ? [{ _id: COMPANY_JOB_ID }]
    : title === undefined ? [{ _id: JOB_ID }] : /accountant/i.test(title) ? [{ _id: JOB_ID }] : [];
  return { select: () => ({ lean: async () => rows }) };
});
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { find: (q: Record<string, unknown>) => jobFind(q) },
}));

jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentEmployerIds: jest.fn(async () => []) }));

const queries: Array<Record<string, unknown>> = [];
function chain() {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "select", "populate"]) c[m] = jest.fn(() => c);
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

async function list(qs: string) {
  const { getHandler } = await import("@/app/api/applications/handlers");
  const { withAuth } = await import("@/lib/auth/withAuth");
  const wrapped = withAuth(getHandler) as unknown as (req: NextRequest) => Promise<Response>;
  return wrapped(new NextRequest(`http://localhost:3888/api/applications?${qs}`));
}

describe("GET /api/applications — search scope by role", () => {
  beforeEach(() => {
    queries.length = 0;
    seekerFind.mockClear();
    userFind.mockClear();
    jobFind.mockClear();
  });

  it("a seeker's search ignores their own profile, so a term only in their skills finds nothing", async () => {
    role = "job_seeker";
    const res = await list("search=React");
    const body = await res.json();

    expect(seekerFind).not.toHaveBeenCalled();
    expect(userFind).not.toHaveBeenCalled();
    expect(body.applications).toEqual([]);
    expect(body.pagination.total).toBe(0);
    // Never widened to "every application this seeker owns".
    expect(queries).toHaveLength(0);
  });

  it("a seeker's search with no hits still reports zero counts, so the status tabs read 0 rather than going blank", async () => {
    role = "job_seeker";
    const body = await (await list("search=React&fetchCounts=true")).json();

    expect(body.statusCounts).toEqual({
      all: 0, applied: 0, shortlisted: 0, interview_scheduled: 0, selected: 0,
      offer: 0, hired: 0, rejected: 0, withdrawn: 0,
    });
  });

  it("a seeker's search still matches the job title", async () => {
    role = "job_seeker";
    await list("search=Accountant");

    expect(queries).toHaveLength(1);
    expect(String(queries[0].jobSeekerId)).toBe(SEEKER_ID);
    const clauses = (queries[0].$and as Array<{ $or: Array<Record<string, unknown>> }>)[0].$or;
    expect(clauses).toEqual([{ jobId: { $in: [JOB_ID] } }]);
  });

  it("a seeker's search still matches the company name", async () => {
    role = "job_seeker";
    await list("search=d4dx");

    expect(queries).toHaveLength(1);
    expect(String(queries[0].jobSeekerId)).toBe(SEEKER_ID);
    const clauses = (queries[0].$and as Array<{ $or: Array<Record<string, unknown>> }>)[0].$or;
    expect(clauses).toEqual([{ jobId: { $in: [COMPANY_JOB_ID] } }]);
  });

  it("staff search still covers candidate fields", async () => {
    role = "employer";
    await list("search=React");

    expect(seekerFind).toHaveBeenCalledTimes(1);
    expect(userFind).toHaveBeenCalledTimes(1);
    const clauses = (queries[0].$and as Array<{ $or: Array<Record<string, unknown>> }>)[0].$or;
    expect(clauses).toEqual([{ jobSeekerId: { $in: [SEEKER_ID] } }]);
  });
});
