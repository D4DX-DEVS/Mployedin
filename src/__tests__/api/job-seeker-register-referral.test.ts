/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { auth: {} },
}));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "10.0.0.1" }));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: async () => "hashed" } }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/subscription/autoAssign", () => ({ autoAssignDefaultPlan: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  EmailTemplates: {
    verifyEmailOtp: () => ({ subject: "v", html: "" }),
    jobSeekerWelcome: () => ({ subject: "w", html: "" }),
  },
}));
jest.mock("@/lib/auth/emailVerification", () => ({ hashOtp: () => "otp" }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn() } }));

const USER_ID = "64e000000000000000000001";
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findOne: jest.fn(async () => null), create: jest.fn(async () => ({ _id: USER_ID })) },
}));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { create: jest.fn(async () => ({ _id: "js" })) } }));

const attach = jest.fn();
jest.mock("@/lib/referrals/attachJobSeeker", () => ({ attachJobSeekerReferral: (...a: unknown[]) => attach(...a) }));

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3888/api/auth/job-seeker-register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Sara", email: "sara@example.com", password: "Str0ng!Passw0rd#2026", ...body }),
  });
}

describe("POST /api/auth/job-seeker-register — referral code", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attach.mockResolvedValue({ attached: true, linkId: "l", referrerRole: "agent" });
  });

  it("hands the code to the attach helper after the profile exists", async () => {
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    const res = await POST(post({ referralCode: "MPL-1A2B3C4D5E6F7A8B" }));
    expect(res.status).toBe(201);
    expect(attach).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, code: "MPL-1A2B3C4D5E6F7A8B" }));
  });

  it("still returns 201 when the code cannot be attached", async () => {
    attach.mockResolvedValue({ attached: false, reason: "expired" });
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    const res = await POST(post({ referralCode: "MPL-1A2B3C4D5E6F7A8B" }));
    expect(res.status).toBe(201);
  });

  it("does not call the helper without a code", async () => {
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    await POST(post({}));
    expect(attach).not.toHaveBeenCalled();
  });

  it("rejects an absurdly long code at validation", async () => {
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    const res = await POST(post({ referralCode: "X".repeat(64) }));
    expect(res.status).toBe(400);
    expect(attach).not.toHaveBeenCalled();
  });
});
