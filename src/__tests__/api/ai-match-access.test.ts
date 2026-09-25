/**
 * @jest-environment node
 *
 * POST /api/ai/match returns the employer's requirements checklist, and that
 * checklist names the qualifying answer to each deal-breaker question. Only
 * the job's own recruiters may call it — a candidate who could would simply
 * answer the screening question the way the checklist says.
 */

import { NextRequest, NextResponse } from "next/server";

const OWNER_USER = "650000000000000000000001";
const EMPLOYER_ID = "650000000000000000000002";
const SEEKER_ID = "650000000000000000000003";
const JOB_ID = "650000000000000000000004";

let caller: { userId: string; role: string } = { userId: OWNER_USER, role: "employer" };

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/subscription/featureGate", () => ({ enforceFeatureGate: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true, remaining: 5, resetAt: Date.now() + 1000 }),
  RATE_LIMIT_CONFIGS: { ai: { limit: 10, windowSec: 60 } },
}));
jest.mock("@/lib/ai/gemini", () => ({
  generateText: jest.fn().mockResolvedValue('{"strengths":[],"gaps":[],"summary":""}'),
  GEMINI_MODELS: { flash: "flash" },
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      try {
        return await handler(req, { ...caller, locale: "en" });
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

const leanChain = (value: unknown) => ({
  select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }),
  lean: jest.fn().mockResolvedValue(value),
});

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => leanChain({ _id: JOB_ID, employerId: EMPLOYER_ID, title: "HR Manager" })) },
}));
jest.mock("@/models/Employer", () => {
  const Employer = {
    findOne: jest.fn(() => leanChain({ _id: EMPLOYER_ID })),
    findById: jest.fn(() => leanChain({ _id: EMPLOYER_ID })),
  };
  return { __esModule: true, default: Employer, Employer };
});
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(() => leanChain(null)) } }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => leanChain({ _id: SEEKER_ID })),
    findOne: jest.fn(() => leanChain({ _id: SEEKER_ID })),
  },
}));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { exists: jest.fn().mockResolvedValue(null), findById: jest.fn(), findByIdAndUpdate: jest.fn() },
}));

const computeApplicantMatch = jest.fn();
jest.mock("@/lib/matching/scoreApplication", () => ({
  computeApplicantMatch: (...args: unknown[]) => computeApplicantMatch(...args),
  applicantMatchUpdate: jest.fn(() => ({})),
  describeMatchForPrompt: jest.fn(() => ""),
}));

const DEAL_BREAKER = {
  key: "screening",
  status: "unknown",
  hard: true,
  questionId: "q-visa",
  label: "Do you hold a Bahrain work visa?",
  required: "Yes",
};

function callMatch() {
  return import("@/app/api/ai/match/route").then(({ POST }) =>
    POST(
      new NextRequest("http://localhost:3000/api/ai/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: JOB_ID }),
      }),
      { params: Promise.resolve({}) },
    ),
  );
}

describe("POST /api/ai/match — recruiter-side only", () => {
  beforeEach(() => {
    computeApplicantMatch.mockReset();
    computeApplicantMatch.mockResolvedValue({
      aiMatchScore: 72,
      seekerMatchScore: 72,
      weightsApplied: false,
      matchBreakdown: { skills: 70, role: 80, experience: 60, overall: 72 },
      requirementsStatus: "unverified",
      qualifications: [DEAL_BREAKER],
      matchedSkills: [],
      missingSkills: [],
    });
  });

  it("refuses a job seeker, so a deal-breaker's qualifying answer never reaches a candidate", async () => {
    caller = { userId: "650000000000000000000009", role: "job_seeker" };
    const res = await callMatch();

    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("q-visa");
    expect(computeApplicantMatch).not.toHaveBeenCalled();
  });

  it("refuses a super-agent whose scope does not cover the job", async () => {
    caller = { userId: "650000000000000000000010", role: "super_agent" };
    const res = await callMatch();

    expect(res.status).toBe(403);
    expect(computeApplicantMatch).not.toHaveBeenCalled();
  });

  it("gives the job's own employer the checklist", async () => {
    caller = { userId: OWNER_USER, role: "employer" };
    const res = await callMatch();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.qualifications).toEqual([DEAL_BREAKER]);
  });
});
