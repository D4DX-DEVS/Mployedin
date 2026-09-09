/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const SOURCE_JOB = "64b000000000000000000003";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
      context.params.then((params) => handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }, params)),
}));

const mockJobCtor = jest.fn();
const mockSave = jest.fn().mockResolvedValue(undefined);
const SOURCE = {
  _id: SOURCE_JOB,
  employerId: EMPLOYER_ID,
  agentId: "64b000000000000000000009",
  title: "Senior Recruiter",
  titleAr: "مسؤول توظيف أول",
  description: "Recruit people, at length, for the whole team.",
  responsibilities: ["Source", "Screen"],
  qualifications: ["CIPD"],
  benefits: ["Visa"],
  learningOutcomes: ["ATS mastery"],
  requirements: { skills: ["Sourcing"] },
  salary: { min: 1000, max: 2000, currency: "AED" },
  showSalary: false,
  location: { country: "UAE", city: "Dubai" },
  employmentType: "full_time",
  workMode: "remote",
  duration: "6 months",
  category: "HR",
  tags: [],
  visibility: "public",
  vacancies: 1,
  maxApplicants: 50,
  workflowMode: "custom",
  workflow: { stages: [{ id: "applied", name: "Applied" }] },
  matchingWeights: { skills: 50, experience: 30, education: 10, industryExperience: 5, preferredQualifications: 5 },
  screeningQuestions: [{ question: "Why us?", required: true }],
  // lifecycle of the original — must not travel
  status: "active",
  expiresAt: new Date("2026-12-31"),
  views: 12,
  uniqueViews: 9,
  applicantIds: ["64b000000000000000000020"],
  poster: { url: "x", approvalStatus: "approved" },
  isFeatured: true,
  pauseReason: "budget",
};
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: Object.assign(
    jest.fn().mockImplementation((doc: Record<string, unknown>) => {
      mockJobCtor(doc);
      return { ...doc, _id: "64b000000000000000000010", save: mockSave };
    }),
    { findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(SOURCE) }) },
  ),
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: EMPLOYER_ID, agentId: null }) }),
    }),
  },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

describe("POST /api/jobs/[id]/clone — no approval state on clones", () => {
  async function clone() {
    const { POST } = await import("@/app/api/jobs/[id]/clone/route");
    const res = await POST(
      new NextRequest(`http://localhost:3000/api/jobs/${SOURCE_JOB}/clone`, { method: "POST" }),
      { params: Promise.resolve({ id: SOURCE_JOB }) },
    );
    return { res, created: mockJobCtor.mock.calls[0][0] as Record<string, unknown> };
  }

  beforeEach(() => { mockJobCtor.mockClear(); mockSave.mockClear(); });

  it("creates the clone as a draft without any poster approval status", async () => {
    const { res, created } = await clone();

    expect(res.status).toBe(201);
    expect(created.status).toBe("draft");
    expect(created).not.toHaveProperty("poster");
    expect(created).not.toHaveProperty("poster.approvalStatus");
    // A draft source may lack required fields; validation waits for publish.
    expect(mockSave).toHaveBeenCalledWith({ validateBeforeSave: false });
  });

  it("copies the whole authoring set and none of the original's lifecycle (A27)", async () => {
    const { created } = await clone();

    for (const k of ["titleAr", "responsibilities", "qualifications", "benefits", "learningOutcomes", "showSalary", "employmentType", "workMode", "duration", "category", "visibility", "maxApplicants", "workflow", "matchingWeights", "screeningQuestions"]) {
      expect(created[k]).toEqual((SOURCE as Record<string, unknown>)[k]);
    }
    expect(created.clonedFrom).toBe(SOURCE_JOB);
    expect(created.workflowMode).toBe("custom");
    for (const k of ["expiresAt", "views", "uniqueViews", "applicantIds", "isFeatured", "pauseReason", "_id"]) {
      expect(created).not.toHaveProperty(k);
    }
  });
});
