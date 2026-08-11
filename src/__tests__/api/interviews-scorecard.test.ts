/**
 * @jest-environment node
 */
/**
 * API Tests — GET /api/interviews/[id]/scorecard
 *
 * Locks in the candidate-vs-employer visibility split:
 *   • a candidate may read their OWN scorecard, and only once the interview is
 *     completed
 *   • the candidate response never carries the panel's internal deliberation
 *     (notes / concerns / recommendation / evaluatedBy)
 *   • employers are scoped to their own interviews
 *
 * Ids are deliberately distinct: interview.jobSeekerId is a JobSeeker._id while
 * ctx.userId is a User._id. Conflating the two is what made this endpoint 403
 * the rightful candidate.
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: jest.fn().mockReturnValue({}),
}));

const INTERVIEW_ID = "6512aaaaaaaaaaaaaaaaaaaa";

// Interview.findById(...).select(...).lean()
const mockInterviewLean = jest.fn();
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: (...a: unknown[]) => mockInterviewLean(...a) }),
    }),
  },
}));

// Scorecard.findOne(...).populate(...).lean()
const mockScorecardLean = jest.fn();
jest.mock("@/models/Scorecard", () => ({
  __esModule: true,
  Scorecard: {
    findOne: jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({ lean: (...a: unknown[]) => mockScorecardLean(...a) }),
      lean: (...a: unknown[]) => mockScorecardLean(...a),
    }),
  },
}));

const mockEmployerLean = jest.fn();
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: (...a: unknown[]) => mockEmployerLean(...a) }),
    }),
  },
}));

const mockSeekerLean = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: (...a: unknown[]) => mockSeekerLean(...a) }),
    }),
  },
}));

const FULL_SCORECARD = {
  _id: "sc_001",
  interviewId: INTERVIEW_ID,
  applicationId: "app_001",
  scores: { technicalSkills: 85, communication: 78, cultureFit: 83, problemSolving: 80, motivation: 84 },
  overallScore: 82,
  strengths: "Strong technical performance",
  // employer-private below
  notes: "Struggled under pressure, would need mentoring",
  concerns: "Salary expectations too high",
  recommendation: "strong_hire",
  evaluatedBy: { name: "Recruiter", email: "r@example.com" },
  createdAt: "2026-08-01T00:00:00.000Z",
};

async function callGet(ctx: { userId: string; role: string }) {
  const { GET } = await import("@/app/api/interviews/[id]/scorecard/route");
  const req = new NextRequest(`http://localhost/api/interviews/${INTERVIEW_ID}/scorecard`);
  return (GET as Function)(req, ctx, { id: INTERVIEW_ID });
}

describe("GET /api/interviews/[id]/scorecard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInterviewLean.mockResolvedValue({
      _id: INTERVIEW_ID,
      employerId: "emp_001",
      jobSeekerId: "seeker_001",
      applicationId: "app_001",
      status: "completed",
    });
    mockScorecardLean.mockResolvedValue(FULL_SCORECARD);
    mockSeekerLean.mockResolvedValue({ _id: "seeker_001" });
    mockEmployerLean.mockResolvedValue({ _id: "emp_001" });
  });

  describe("candidate access", () => {
    it("returns the scorecard for the candidate's own completed interview", async () => {
      const res = await callGet({ userId: "user_001", role: "job_seeker" });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.scorecard.overallScore).toBe(82);
      expect(data.scorecard.scores.technicalSkills).toBe(85);
    });

    it("never leaks the panel's internal deliberation to the candidate", async () => {
      const res = await callGet({ userId: "user_001", role: "job_seeker" });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.scorecard).not.toHaveProperty("notes");
      expect(data.scorecard).not.toHaveProperty("concerns");
      expect(data.scorecard).not.toHaveProperty("recommendation");
      expect(data.scorecard).not.toHaveProperty("evaluatedBy");
      // Guard against a future model field arriving in the candidate payload:
      // the candidate view is an allow-list, so its keys are fully enumerable.
      expect(Object.keys(data.scorecard).sort()).toEqual(
        ["_id", "applicationId", "createdAt", "interviewId", "overallScore", "scores", "strengths"]
      );
    });

    it("rejects the candidate while the interview is not completed (403)", async () => {
      mockInterviewLean.mockResolvedValue({
        _id: INTERVIEW_ID,
        employerId: "emp_001",
        jobSeekerId: "seeker_001",
        applicationId: "app_001",
        status: "scheduled",
      });

      const res = await callGet({ userId: "user_001", role: "job_seeker" });
      expect(res.status).toBe(403);
    });

    it("rejects a candidate reading another candidate's scorecard (403)", async () => {
      mockSeekerLean.mockResolvedValue({ _id: "seeker_999" });

      const res = await callGet({ userId: "user_001", role: "job_seeker" });
      expect(res.status).toBe(403);
    });

    it("rejects a caller with no job seeker profile (403)", async () => {
      mockSeekerLean.mockResolvedValue(null);

      const res = await callGet({ userId: "user_001", role: "job_seeker" });
      expect(res.status).toBe(403);
    });
  });

  describe("employer access", () => {
    it("returns the full internal scorecard to the owning employer", async () => {
      const res = await callGet({ userId: "user_emp", role: "employer" });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.scorecard.notes).toBe(FULL_SCORECARD.notes);
      expect(data.scorecard.concerns).toBe(FULL_SCORECARD.concerns);
      expect(data.scorecard.recommendation).toBe("strong_hire");
    });

    it("rejects an employer reading another employer's interview (403)", async () => {
      mockEmployerLean.mockResolvedValue({ _id: "emp_999" });

      const res = await callGet({ userId: "user_emp", role: "employer" });
      expect(res.status).toBe(403);
    });
  });

  it("404s an unknown interview", async () => {
    mockInterviewLean.mockResolvedValue(null);

    const res = await callGet({ userId: "user_001", role: "job_seeker" });
    expect(res.status).toBe(404);
  });
});
