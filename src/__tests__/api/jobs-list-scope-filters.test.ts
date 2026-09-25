/**
 * @jest-environment node
 *
 * GET /api/jobs — caller-supplied filters must narrow the caller's scope, never
 * replace it (audit 2026-09-24, SEC-01 / SEC-04):
 *  - `employerId=` used to OVERWRITE the super-agent portfolio scope and the
 *    employer's own-company scope, so `?myJobs=true&employerId=<other>&status=draft`
 *    returned another company's drafts.
 *  - `applications=none` used to overwrite a colleague's per-job restriction.
 *  - A colleague's job restriction was looked up by the swapped owner id, so it
 *    never applied.
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

const OWN_EMP = new Types.ObjectId();
const OTHER_EMP = new Types.ObjectId();
const SA_EMP = new Types.ObjectId();
const ALLOWED_JOB = new Types.ObjectId();

const getSuperAgentEmployerIds = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentEmployerIds: (...a: unknown[]) => getSuperAgentEmployerIds(...a),
}));

jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: {} }));

const employerFindOneLean = jest.fn();
const employerFindByIdLean = jest.fn();
const employerFindLean = jest.fn();
jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: () => ({ select: () => ({ lean: employerFindOneLean }) }),
    findById: () => ({ select: () => ({ lean: employerFindByIdLean }) }),
    find: () => ({ select: () => ({ lean: employerFindLean }) }),
  },
}));

const companyUserFindOne = jest.fn();
jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: {
    findOne: (...a: unknown[]) => {
      companyUserFindOne(...a);
      return { select: () => ({ lean: () => Promise.resolve(companyUserRow) }) };
    },
  },
}));
let companyUserRow: unknown = null;

const applicationDistinct = jest.fn().mockResolvedValue([]);
jest.mock("@/models/Application", () => ({
  Application: {
    aggregate: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(0),
    distinct: (...a: unknown[]) => applicationDistinct(...a),
  },
}));
jest.mock("@/models/ExtractionDraft", () => ({ ExtractionDraft: {} }));

const jobCount = jest.fn().mockResolvedValue(0);
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
    aggregate: jest.fn().mockResolvedValue([]),
  },
}));

import { getHandler } from "@/app/api/jobs/handlers";

function lastQuery(): Record<string, unknown> {
  const calls = jobCount.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

/** Collect every employerId constraint on the query (top level + $and). */
function employerConstraints(q: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  if ("employerId" in q) out.push(q.employerId);
  for (const c of (q.$and as Record<string, unknown>[] | undefined) ?? []) {
    if ("employerId" in c) out.push(c.employerId);
  }
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  companyUserRow = null;
  employerFindByIdLean.mockResolvedValue({ _id: OTHER_EMP, companyName: "Other Co" });
  employerFindLean.mockResolvedValue([{ _id: OTHER_EMP }]);
});

describe("employerId filter keeps the caller's scope", () => {
  it("super-agent: an employer outside the portfolio stays excluded", async () => {
    getSuperAgentEmployerIds.mockResolvedValue([SA_EMP]);
    const ctx = { userId: "aaaaaaaaaaaaaaaaaaaaaaaa", role: "super_agent" as const, locale: "en" };
    await getHandler(
      new NextRequest(`http://localhost/api/jobs?employerId=${OTHER_EMP}&status=draft`),
      ctx,
    );
    const constraints = employerConstraints(lastQuery());
    // The portfolio scope must still be on the query.
    expect(constraints).toContainEqual({ $in: [SA_EMP] });
    // …and the requested employer is ANDed on top, not substituted.
    expect(constraints.length).toBeGreaterThanOrEqual(2);
  });

  it("employer myJobs: another company's id cannot replace the own-company scope", async () => {
    employerFindOneLean.mockResolvedValue({ _id: OWN_EMP });
    const ctx = { userId: "bbbbbbbbbbbbbbbbbbbbbbbb", role: "employer" as const, locale: "en" };
    await getHandler(
      new NextRequest(`http://localhost/api/jobs?myJobs=true&employerId=${OTHER_EMP}&status=draft`),
      ctx,
    );
    const q = lastQuery();
    expect(q.employerId).toEqual(OWN_EMP);
    expect(employerConstraints(q).length).toBeGreaterThanOrEqual(2);
  });

  it("public feed: employerId still filters active jobs of that employer", async () => {
    const ctx = { userId: "cccccccccccccccccccccccc", role: "job_seeker" as const, locale: "en" };
    await getHandler(new NextRequest(`http://localhost/api/jobs?employerId=${OTHER_EMP}`), ctx);
    const q = lastQuery();
    expect(q.status).toBe("active");
    expect(employerConstraints(q)).toContainEqual(OTHER_EMP);
  });
});

describe("short search", () => {
  it("matches the title instead of $text, which drops 1–2 character terms", async () => {
    const ctx = { userId: "cccccccccccccccccccccccc", role: "job_seeker" as const, locale: "en" };
    await getHandler(new NextRequest("http://localhost/api/jobs?search=a"), ctx);
    const q = lastQuery();
    expect(q.$text).toBeUndefined();
    expect(q.title).toEqual(/a/i);
  });

  it("keeps $text for longer searches", async () => {
    const ctx = { userId: "cccccccccccccccccccccccc", role: "job_seeker" as const, locale: "en" };
    await getHandler(new NextRequest("http://localhost/api/jobs?search=developer"), ctx);
    expect(lastQuery().$text).toEqual({ $search: "developer" });
  });
});

describe("colleague job restriction", () => {
  const colleagueCtx = {
    userId: "dddddddddddddddddddddddd", // swapped to the owner by withAuth
    role: "employer" as const,
    locale: "en",
    member: {
      actorId: "eeeeeeeeeeeeeeeeeeeeeeee",
      companyId: String(OWN_EMP),
      companyRoles: ["hiring_manager"],
      permissions: {},
      jobAccess: [String(ALLOWED_JOB)],
    },
  };

  it("looks the colleague up by their real id and confines them to their jobs", async () => {
    employerFindOneLean.mockResolvedValue({ _id: OWN_EMP });
    companyUserRow = { companyRole: "hiring_manager", companyRoles: ["hiring_manager"], jobAccess: [ALLOWED_JOB] };
    await getHandler(new NextRequest("http://localhost/api/jobs?myJobs=true"), colleagueCtx as never);
    expect(companyUserFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "eeeeeeeeeeeeeeeeeeeeeeee" }),
    );
    expect(JSON.stringify(lastQuery())).toContain(String(ALLOWED_JOB));
  });

  it("applications=none cannot lift the colleague's restriction", async () => {
    employerFindOneLean.mockResolvedValue({ _id: OWN_EMP });
    companyUserRow = { companyRole: "hiring_manager", companyRoles: ["hiring_manager"], jobAccess: [ALLOWED_JOB] };
    await getHandler(
      new NextRequest("http://localhost/api/jobs?myJobs=true&applications=none"),
      colleagueCtx as never,
    );
    const serialized = JSON.stringify(lastQuery());
    expect(serialized).toContain(String(ALLOWED_JOB));
    expect(serialized).toContain("$nin");
  });

  it("an owner is not restricted and needs no membership lookup", async () => {
    employerFindOneLean.mockResolvedValue({ _id: OWN_EMP });
    const ownerCtx = { userId: "ffffffffffffffffffffffff", role: "employer" as const, locale: "en" };
    await getHandler(new NextRequest("http://localhost/api/jobs?myJobs=true"), ownerCtx);
    expect(lastQuery()._id).toBeUndefined();
  });
});
