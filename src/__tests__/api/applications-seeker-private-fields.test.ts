/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

// QA retest 2026-10-06: the seeker's Applications list returned the employer's
// internal notes thread ("QA test note - strong candidate…") plus the
// engagement ranking. The detail route already stripped `notes`; the list
// projection excluded `employerNotes` only, so the thread and `agentNotes`
// went out with every row.

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

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: SEEKER_ID }) }) })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })) },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: EMPLOYER_ID }) }) })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
  },
}));
jest.mock("@/models/CompanyUser", () => ({
  __esModule: true,
  CompanyUser: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      select: () => ({
        lean: async () => [{ _id: JOB_ID }],
        sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      }),
    })),
  },
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentEmployerIds: jest.fn(async () => []) }));

// Mongoose would apply the projection; the mock ignores it, so the response
// strip is what these tests prove. The projection string is asserted apart.
const selects: unknown[] = [];
const storedRow = () => ({
  _id: "64b0000000000000000000f1",
  jobSeekerId: { _id: SEEKER_ID },
  jobId: { _id: JOB_ID, title: "React Developer" },
  status: "applied",
  aiMatchScore: 88,
  notes: [{ authorName: "Employer", content: "QA test note - strong candidate" }],
  agentNotes: "call the candidate Monday",
  employerNotes: "maybe",
  behaviorSignals: { profileCompleteness: 90, applicationCompleteness: 50 },
  behaviorScore: 71,
  rejectionReason: "not a fit",
});
function chain() {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "populate"]) c[m] = jest.fn(() => c);
  c.select = jest.fn((s: unknown) => { selects.push(s); return c; });
  c.lean = jest.fn(async () => [storedRow()]);
  return c;
}
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => chain()),
    countDocuments: jest.fn(async () => 1),
    aggregate: jest.fn(async () => []),
  },
}));
// Enrichment lookups (interviews/offers/placements for the seeker, background
// checks for the employer) return nothing here.
function emptyChain() {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "select", "limit"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => []);
  return c;
}
for (const model of ["Interview", "Offer", "Placement", "BackgroundCheck"]) {
  jest.doMock(`@/models/${model}`, () => ({ __esModule: true, default: { find: jest.fn(() => emptyChain()) } }));
}

async function list() {
  const { getHandler } = await import("@/app/api/applications/handlers");
  const { withAuth } = await import("@/lib/auth/withAuth");
  const wrapped = withAuth(getHandler) as unknown as (req: NextRequest) => Promise<Response>;
  return wrapped(new NextRequest("http://localhost:3888/api/applications?limit=10"));
}

const PRIVATE = ["notes", "agentNotes", "employerNotes", "behaviorSignals", "behaviorScore", "rejectionReason"];

describe("GET /api/applications — recruiter-only fields never reach the seeker", () => {
  beforeEach(() => { selects.length = 0; });

  it("strips the notes thread, agent notes and the engagement ranking from a seeker's rows", async () => {
    role = "job_seeker";
    const body = await (await list()).json();

    expect(body.applications).toHaveLength(1);
    for (const key of PRIVATE) expect(body.applications[0]).not.toHaveProperty(key);
    // What the seeker list renders survives.
    expect(body.applications[0].status).toBe("applied");
    expect(body.applications[0].aiMatchScore).toBe(88);
  });

  it("asks Mongo not to load those fields for a seeker either", async () => {
    role = "job_seeker";
    await list();
    const projection = String(selects.find((s) => typeof s === "string" && s.includes("-")));
    for (const key of PRIVATE) expect(projection.split(/\s+/)).toContain(`-${key}`);
  });

  it("leaves the employer's own view untouched", async () => {
    role = "employer";
    const body = await (await list()).json();
    expect(body.applications[0].notes).toHaveLength(1);
    expect(body.applications[0].behaviorScore).toBe(71);
  });
});

describe("stripSeekerHiddenFields", () => {
  it("removes every recruiter-only key and keeps the rest", async () => {
    const { stripSeekerHiddenFields, SEEKER_HIDDEN_APPLICATION_FIELDS } = await import("@/lib/applications/seekerView");
    const row: Record<string, unknown> = { status: "offer", ...Object.fromEntries(SEEKER_HIDDEN_APPLICATION_FIELDS.map((k) => [k, "x"])) };
    const out = stripSeekerHiddenFields(row);
    expect(Object.keys(out)).toEqual(["status"]);
  });
});
