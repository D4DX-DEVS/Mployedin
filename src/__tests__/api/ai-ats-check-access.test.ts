/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

const EMPLOYER_USER = "650000000000000000000001";
const EMPLOYER_ID = "650000000000000000000002";
const SEEKER_ID = "650000000000000000000003";
const JOB_ID = "650000000000000000000004";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true, remaining: 5, resetAt: Date.now() + 1000 }),
  RATE_LIMIT_CONFIGS: { ai: { limit: 10, windowSec: 60 } },
}));
jest.mock("@/lib/storage/spaces", () => ({ downloadBuffer: jest.fn() }));
jest.mock("@/lib/ats/analyzeCv", () => ({
  analyzeResumeText: jest.fn(),
  extractResumeText: jest.fn(),
  computeKeywordCoverage: jest.fn(),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      try {
        return await handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" });
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

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => leanChain({ _id: SEEKER_ID, documents: [{ category: "resume", url: "https://x/cv.pdf" }] })), findOne: jest.fn() },
}));
jest.mock("@/models/Employer", () => {
  const Employer = { findOne: jest.fn(() => leanChain({ _id: EMPLOYER_ID })) };
  return { __esModule: true, default: Employer, Employer };
});
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
const applicationExists = jest.fn().mockResolvedValue(null);
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { exists: (...a: unknown[]) => applicationExists(...a) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => leanChain({ _id: JOB_ID, employerId: EMPLOYER_ID, requirements: { skills: ["React"] } })), find: jest.fn() },
}));

describe("POST /api/ai/ats-check — candidate access is checked even when a jobId is supplied", () => {
  it("refuses an employer with no application from that candidate", async () => {
    const { POST } = await import("@/app/api/ai/ats-check/route");
    const res = await POST(
      new NextRequest("http://localhost:3000/api/ai/ats-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSeekerId: SEEKER_ID, jobId: JOB_ID }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(403);
    expect(applicationExists).toHaveBeenCalled();
  });
});
