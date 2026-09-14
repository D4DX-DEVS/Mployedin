/**
 * @jest-environment node
 */
/**
 * A job document carries employer-only data — above all `applicantIds`, the ids
 * of every candidate who applied. Both the detail route and the public feed used
 * to return the raw document, so any signed-in job seeker could read them.
 */

import { NextRequest } from "next/server";

const OWNER_EMPLOYER = "651000000000000000000001";
const JOB_ID = "651000000000000000000003";
const APPLICANT_A = "651000000000000000000011";
const APPLICANT_B = "651000000000000000000012";

function jobDoc() {
  return {
    _id: JOB_ID,
    employerId: { _id: OWNER_EMPLOYER, companyName: "Acme" },
    title: "Backend Engineer",
    status: "active",
    screeningQuestions: [{ id: "notice", label: "Notice period?" }],
    applicantIds: [APPLICANT_A, APPLICANT_B],
    agentId: "651000000000000000000099",
    workflowMode: "auto",
    workflow: { stages: ["screen"] },
    matchingWeights: { skills: 0.7 },
  };
}

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/security/sanitize", () => ({ isValidObjectId: () => true, escapeRegex: (s: string) => s }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: jest.fn() }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({ lean: jest.fn(async () => jobDoc()) }),
    }),
  },
}));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn(), findById: jest.fn() } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

const PRIVATE = ["applicantIds", "agentId", "workflow", "workflowMode", "matchingWeights"];

describe("GET /api/jobs/[id] — employer-only fields", () => {
  beforeEach(() => jest.clearAllMocks());

  it("strips them for a job seeker", async () => {
    const { getScopedEmployerIds } = await import("@/lib/auth/agentRestrictions");
    // A job seeker has no employer scope at all.
    (getScopedEmployerIds as jest.Mock).mockResolvedValue([]);
    const { getHandler } = await import("@/app/api/jobs/[id]/handlers");

    const req = new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`);
    const res = await getHandler(req, { userId: "u1", role: "job_seeker", locale: "en" }, { id: JOB_ID });
    const { job } = await res.json();

    expect(res.status).toBe(200);
    for (const field of PRIVATE) expect(job).not.toHaveProperty(field);
    // The posting itself still has to arrive intact, screening questions included
    // — Easy Apply renders them from this response.
    expect(job.title).toBe("Backend Engineer");
    expect(job.screeningQuestions).toHaveLength(1);
  });

  it("keeps them for the owning employer", async () => {
    const { getScopedEmployerIds } = await import("@/lib/auth/agentRestrictions");
    (getScopedEmployerIds as jest.Mock).mockResolvedValue([OWNER_EMPLOYER]);
    const { getHandler } = await import("@/app/api/jobs/[id]/handlers");

    const req = new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`);
    const res = await getHandler(req, { userId: "u2", role: "employer", locale: "en" }, { id: JOB_ID });
    const { job } = await res.json();

    expect(job.applicantIds).toEqual([APPLICANT_A, APPLICANT_B]);
    expect(job.workflowMode).toBe("auto");
  });

  it("keeps them for an admin (unrestricted scope)", async () => {
    const { getScopedEmployerIds } = await import("@/lib/auth/agentRestrictions");
    (getScopedEmployerIds as jest.Mock).mockResolvedValue(null);
    const { getHandler } = await import("@/app/api/jobs/[id]/handlers");

    const req = new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`);
    const res = await getHandler(req, { userId: "u3", role: "admin", locale: "en" }, { id: JOB_ID });
    const { job } = await res.json();

    expect(job.applicantIds).toEqual([APPLICANT_A, APPLICANT_B]);
  });
});

describe("stripPrivateJobFields", () => {
  it("covers every employer-only field the feed must not publish", async () => {
    const { PRIVATE_JOB_FIELDS, stripPrivateJobFields } = await import("@/lib/jobs/visibility");
    expect([...PRIVATE_JOB_FIELDS]).toEqual(expect.arrayContaining(PRIVATE));

    const doc: Record<string, unknown> = { title: "t", applicantIds: ["x"], matchingWeights: {} };
    stripPrivateJobFields(doc);
    expect(doc).toEqual({ title: "t" });
  });
});
