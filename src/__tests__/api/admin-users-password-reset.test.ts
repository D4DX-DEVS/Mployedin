/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

let currentRole: "admin" | "agent" = "admin";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: string; locale: string }) => Promise<Response>) => {
    return async (req: NextRequest) => {
      try {
        return await handler(req, { userId: "507f1f77bcf86cd799439099", role: currentRole, locale: "en" });
      } catch (err) {
        // Mirrors the real withAuth: validateBody() throws a NextResponse on validation failure.
        if (err instanceof NextResponse) return err;
        throw err;
      }
    };
  },
}));

const logActivityMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: (...args: unknown[]) => logActivityMock(...args),
}));

const rateLimitMock = jest.fn().mockResolvedValue({ allowed: true });
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

const issuePasswordResetMock = jest.fn().mockResolvedValue({ delivered: true });
jest.mock("@/lib/auth/passwordReset", () => ({
  issuePasswordReset: (...args: unknown[]) => issuePasswordResetMock(...args),
}));

const findByIdMock = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  User: { findById: (...args: unknown[]) => findByIdMock(...args) },
  default: { findById: (...args: unknown[]) => findByIdMock(...args) },
}));

const TARGET_ID = "507f1f77bcf86cd799439011";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/users/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/users/password-reset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentRole = "admin";
    rateLimitMock.mockResolvedValue({ allowed: true });
    issuePasswordResetMock.mockResolvedValue({ delivered: true });
  });

  it("mails a reset link for an active account and records who sent it", async () => {
    const target = { _id: TARGET_ID, email: "user@example.com", role: "employer", isActive: true };
    findByIdMock.mockResolvedValue(target);

    const POST = (await import("@/app/api/admin/users/password-reset/route")).POST as unknown as (req: NextRequest) => Promise<Response>;
    const res = await POST(makeRequest({ userId: TARGET_ID }));

    expect(res.status).toBe(200);
    expect(issuePasswordResetMock).toHaveBeenCalledWith(target, expect.objectContaining({
      actor: { actorId: "507f1f77bcf86cd799439099", actorRole: "admin" },
    }));
    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "user.password_reset_sent",
      resourceId: TARGET_ID,
      actorId: "507f1f77bcf86cd799439099",
    }));
  });

  /**
   * reset-password only accepts a token for an active account, so a link mailed
   * to a deactivated user can never be redeemed. Refusing here is what keeps
   * the menu item from being a control that reports success and does nothing.
   */
  it("refuses a deactivated account instead of sending a dead link", async () => {
    findByIdMock.mockResolvedValue({ _id: TARGET_ID, email: "user@example.com", role: "employer", isActive: false });

    const POST = (await import("@/app/api/admin/users/password-reset/route")).POST as unknown as (req: NextRequest) => Promise<Response>;
    const res = await POST(makeRequest({ userId: TARGET_ID }));

    expect(res.status).toBe(409);
    expect(issuePasswordResetMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user", async () => {
    findByIdMock.mockResolvedValue(null);

    const POST = (await import("@/app/api/admin/users/password-reset/route")).POST as unknown as (req: NextRequest) => Promise<Response>;
    const res = await POST(makeRequest({ userId: TARGET_ID }));

    expect(res.status).toBe(404);
    expect(issuePasswordResetMock).not.toHaveBeenCalled();
  });

  it("reports a delivery failure rather than claiming the mail went out", async () => {
    findByIdMock.mockResolvedValue({ _id: TARGET_ID, email: "user@example.com", role: "employer", isActive: true });
    issuePasswordResetMock.mockResolvedValue({ delivered: false });

    const POST = (await import("@/app/api/admin/users/password-reset/route")).POST as unknown as (req: NextRequest) => Promise<Response>;
    const res = await POST(makeRequest({ userId: TARGET_ID }));

    expect(res.status).toBe(502);
    // Still audited, so a bounced send is visible after the fact.
    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "user.password_reset_sent",
      meta: expect.objectContaining({ delivered: false }),
    }));
  });

  it("rejects a non-admin even though the route is permission-guarded", async () => {
    currentRole = "agent";
    const POST = (await import("@/app/api/admin/users/password-reset/route")).POST as unknown as (req: NextRequest) => Promise<Response>;
    const res = await POST(makeRequest({ userId: TARGET_ID }));

    expect(res.status).toBe(403);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid userId before touching the database", async () => {
    const POST = (await import("@/app/api/admin/users/password-reset/route")).POST as unknown as (req: NextRequest) => Promise<Response>;
    const res = await POST(makeRequest({ userId: "not-an-id" }));

    expect(res.status).toBe(400);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("honours the per-admin rate limit", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false });

    const POST = (await import("@/app/api/admin/users/password-reset/route")).POST as unknown as (req: NextRequest) => Promise<Response>;
    const res = await POST(makeRequest({ userId: TARGET_ID }));

    expect(res.status).toBe(429);
    expect(findByIdMock).not.toHaveBeenCalled();
  });
});
