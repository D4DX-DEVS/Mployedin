/**
 * @jest-environment node
 *
 * GET/PATCH /api/applications/[id]/screening-answers
 * - GET: Fetch screening questions for the seeker's application
 * - PATCH: Submit screening answers
 * - Both endpoints restricted to job seekers accessing their own applications
 * - Enforces that screening was requested before accepting answers
 */
import { NextRequest, NextResponse } from "next/server";

const USER_ID = "64b100000000000000000001";
const SEEKER_ID = "64b100000000000000000002";
const APP_ID = "64b100000000000000000003";
let ctxRole = "job_seeker";
let ctxUserId = USER_ID;

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, {
          userId: ctxUserId,
          role: ctxRole,
          locale: "en",
        }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/validators", () => ({
  validateBody: jest.fn((req, _schema) => req.json()),
}));
jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

describe("GET /api/applications/[id]/screening-answers", () => {
  it("should reject non-job-seeker roles", async () => {
    ctxRole = "employer";
    const { GET } = await import(
      "@/app/api/applications/[id]/screening-answers/route"
    );

    const req = new NextRequest("http://localhost:3000/api/applications/test/screening-answers", {
      method: "GET",
    });

    const res = await GET(req, { params: Promise.resolve({ id: APP_ID }) });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/applications/[id]/screening-answers", () => {
  it("should reject non-job-seeker roles", async () => {
    ctxRole = "employer";
    const { PATCH } = await import(
      "@/app/api/applications/[id]/screening-answers/route"
    );

    const req = new NextRequest("http://localhost:3000/api/applications/test/screening-answers", {
      method: "PATCH",
      body: JSON.stringify({
        answers: [
          {
            questionId: "q1",
            questionLabel: "Test?",
            answer: "Answer",
          },
        ],
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: APP_ID }) });
    expect(res.status).toBe(403);
  });
});
