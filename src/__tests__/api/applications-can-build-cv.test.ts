/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

// CV standardisation: the employer applicants list says per candidate whether a
// Standardised CV can be drawn (canBuildCv), using the one rule that respects
// the sections the candidate hid. The fields read for it never leave the route.

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

let seekerDoc: Record<string, unknown> = {};
function chain() {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "populate", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => [{
    _id: "64b0000000000000000000f1",
    jobSeekerId: { _id: SEEKER_ID, ...seekerDoc },
    jobId: { _id: JOB_ID, title: "React Developer" },
    status: "applied",
  }]);
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
function emptyChain() {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "select", "limit"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => []);
  return c;
}
for (const model of ["Interview", "Offer", "Placement", "BackgroundCheck"]) {
  jest.doMock(`@/models/${model}`, () => ({ __esModule: true, default: { find: jest.fn(() => emptyChain()) } }));
}

async function firstSeeker() {
  role = "employer";
  const { getHandler } = await import("@/app/api/applications/handlers");
  const { withAuth } = await import("@/lib/auth/withAuth");
  const wrapped = withAuth(getHandler) as unknown as (req: NextRequest) => Promise<Response>;
  const body = await (await wrapped(new NextRequest("http://localhost:3888/api/applications?limit=10"))).json();
  return body.applications[0].jobSeekerId as Record<string, unknown>;
}

describe("GET /api/applications — canBuildCv on each candidate", () => {
  it("is true when only a summary or education is filled (fields the list does not otherwise carry)", async () => {
    seekerDoc = { summary: "Senior accountant", skills: [] };
    expect((await firstSeeker()).canBuildCv).toBe(true);
    seekerDoc = { education: [{ degree: "BSc" }] };
    expect((await firstSeeker()).canBuildCv).toBe(true);
  });

  it("respects hidden sections: experience the candidate hid does not count", async () => {
    seekerDoc = { experience: [{ jobTitle: "Accountant" }], cvDesign: { hiddenSections: ["experience"] } };
    expect((await firstSeeker()).canBuildCv).toBe(false);
  });

  it("never sends the summary, education or CV design it read", async () => {
    seekerDoc = { summary: "Senior accountant", education: [{ degree: "BSc" }], cvDesign: { hiddenSections: [] } };
    const seeker = await firstSeeker();
    expect(seeker).not.toHaveProperty("summary");
    expect(seeker).not.toHaveProperty("education");
    expect(seeker).not.toHaveProperty("cvDesign");
  });
});
