/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const USER_ID = "64e000000000000000000001";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 2, resetAt: Date.now() + 1000 }),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: USER_ID, role: "job_seeker", locale: "en" }),
}));
jest.mock("@/lib/storage/spaces", () => ({ deleteFile: jest.fn().mockResolvedValue(undefined) }));

const leanChain = (value: unknown) => ({
  select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }),
  populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }),
  lean: jest.fn().mockResolvedValue(value),
});

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => leanChain({ _id: USER_ID, name: "Sara Ahmed", email: "sara@example.com", role: "job_seeker" })),
    findByIdAndUpdate: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => leanChain({ _id: "seeker_1" })),
    findOneAndUpdate: jest.fn(() => leanChain(null)),
  },
}));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { find: jest.fn(() => leanChain([])) } }));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { find: jest.fn(() => leanChain([])) } }));
jest.mock("@/models/Notification", () => ({
  __esModule: true,
  default: { find: jest.fn(() => leanChain([])), deleteMany: jest.fn().mockResolvedValue(undefined) },
}));

const gdprCreate = jest.fn().mockResolvedValue({ _id: "req_1" });
jest.mock("@/models/GdprRequest", () => ({
  __esModule: true,
  default: { create: (...a: unknown[]) => gdprCreate(...a) },
}));

describe("Self-service GDPR actions are recorded in the admin register", () => {
  beforeEach(() => gdprCreate.mockClear());

  it("GET /api/gdpr/export records a completed export request", async () => {
    const { GET } = await import("@/app/api/gdpr/export/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/gdpr/export"), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(gdprCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      userEmail: "sara@example.com",
      requestType: "export",
      status: "completed",
      completedAt: expect.any(Date),
    }));
  });

  it("DELETE /api/gdpr/export records a completed erasure request without keeping the real e-mail", async () => {
    const { DELETE } = await import("@/app/api/gdpr/export/route");
    const res = await DELETE(new NextRequest("http://localhost:3000/api/gdpr/export", { method: "DELETE" }), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const recorded = gdprCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(recorded.requestType).toBe("delete");
    expect(recorded.status).toBe("completed");
    expect(recorded.userEmail).not.toBe("sara@example.com");
  });
});
