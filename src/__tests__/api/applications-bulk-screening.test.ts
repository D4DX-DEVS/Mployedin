/**
 * @jest-environment node
 *
 * POST /api/applications/bulk-screening
 * Send screening questions to selected applications.
 * - Skips applications that already have answers
 * - Respects permission scopes (employer, agent, super_agent)
 * - Rate limits bulk actions
 * - Caps at 100 applications per request
 */
import { NextRequest, NextResponse } from "next/server";

const USER_ID = "64b100000000000000000001";
const EMPLOYER_ID = "64b100000000000000000002";
const APP_ID_1 = "64b100000000000000000003";
const APP_ID_2 = "64b100000000000000000004";
let ctxRole = "employer";
let ctxUserId = USER_ID;

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      try {
        return await handler(req, {
          userId: ctxUserId,
          role: ctxRole,
          locale: "en",
        });
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
jest.mock("@/lib/security/clientIp", () => ({
  getClientIp: () => "127.0.0.1",
}));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn((_key, _config) =>
    Promise.resolve({ allowed: true })
  ),
  RATE_LIMIT_CONFIGS: {
    bulk: { windowMs: 60000, maxRequests: 10 },
  },
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getScopedEmployerIds: jest.fn(() => Promise.resolve([])),
}));
jest.mock("@/lib/notifications/trigger", () => ({
  notify: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: (ctx: unknown) => ctx,
}));

describe("POST /api/applications/bulk-screening", () => {
  it("should reject non-employer/agent/super_agent roles", async () => {
    ctxRole = "job_seeker";
    const { POST } = await import(
      "@/app/api/applications/bulk-screening/route"
    );

    const req = new NextRequest("http://localhost:3000/api/applications/bulk-screening", {
      method: "POST",
      body: JSON.stringify({ applicationIds: [APP_ID_1] }),
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it("should validate applicationIds parameter", async () => {
    ctxRole = "employer";
    const { POST } = await import(
      "@/app/api/applications/bulk-screening/route"
    );

    const req = new NextRequest("http://localhost:3000/api/applications/bulk-screening", {
      method: "POST",
      body: JSON.stringify({ applicationIds: [] }),
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it("should cap maximum applications at 100", async () => {
    ctxRole = "employer";
    const { POST } = await import(
      "@/app/api/applications/bulk-screening/route"
    );

    const tooMany = Array.from({ length: 101 }, (_, i) =>
      `64b10000000000000000${String(i).padStart(4, "0")}`
    );

    const req = new NextRequest("http://localhost:3000/api/applications/bulk-screening", {
      method: "POST",
      body: JSON.stringify({ applicationIds: tooMany }),
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });
});
