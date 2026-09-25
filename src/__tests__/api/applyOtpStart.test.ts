/**
 * @jest-environment node
 */
/**
 * POST /api/auth/apply-otp/start — passwordless quick-apply, step 1.
 *
 * Contract under test:
 * - Requesting a code creates NO User and NO JobSeeker. The hashed code goes to
 *   PendingSignin (upsert, one row per email); the account is created only when
 *   the "email-otp" provider redeems it.
 * - Existing job_seeker gets a code; existing non-seeker / inactive account gets
 *   the same 200 {sent:true} with no email (anti-enumeration).
 * - reCAPTCHA v3: skipped when RECAPTCHA_SECRET_KEY is unset; when set, a missing
 *   or failed token is 403, an unreachable verifier is 503.
 * - Invalid email 400, IP limit 429, per-email limit masked 200, mailer down 502.
 * - Every post-validation response takes at least the floor latency, so the
 *   staff-vs-seeker branch is not measurable from outside.
 */

import { NextRequest } from "next/server";

let mockUser: { findOne: jest.Mock; create: jest.Mock; findByIdAndUpdate: jest.Mock };
// Declared outside the factory: the route no longer imports JobSeeker at all,
// so jest never runs that factory. The assertion below still documents intent.
const mockJobSeeker = { create: jest.fn(), updateOne: jest.fn() };
let mockPendingSignin: { findOneAndUpdate: jest.Mock };
let mockCheckRateLimit: jest.Mock;
let mockSendEmail: jest.Mock;
let mockValidateBody: jest.Mock;
let mockHashOtp: jest.Mock;
let mockVerifyRecaptcha: jest.Mock;

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/security/rateLimit", () => {
  mockCheckRateLimit = jest.fn(() =>
    Promise.resolve({ allowed: true, remaining: 10, resetAt: Date.now() + 60000 }),
  );
  return {
    checkRateLimit: mockCheckRateLimit,
    RATE_LIMIT_CONFIGS: { auth: { limit: 10, windowSec: 60 } },
  };
});

jest.mock("@/lib/validators", () => {
  mockValidateBody = jest.fn(async (req: NextRequest) => {
    const body = await req.json();
    if (!body.email || typeof body.email !== "string" || !body.email.includes("@")) {
      throw new Error("Invalid email");
    }
    return body;
  });
  return { validateBody: mockValidateBody };
});

jest.mock("@/lib/auth/emailVerification", () => {
  mockHashOtp = jest.fn((otp: string, purpose?: string) => `hashed_${purpose ?? "verify"}_${otp}`);
  return { hashOtp: mockHashOtp };
});

jest.mock("@/lib/security/recaptcha", () => {
  mockVerifyRecaptcha = jest.fn().mockResolvedValue({ ok: true, skipped: true });
  return { verifyRecaptcha: mockVerifyRecaptcha };
});

jest.mock("@/lib/communications/email", () => {
  mockSendEmail = jest.fn().mockResolvedValue({ success: true });
  return {
    sendEmail: mockSendEmail,
    EmailTemplates: {
      verifyEmailOtpQuickApply: (otp: string, name: string) => ({
        subject: "Verify your email",
        html: `<p>Hi ${name}, your code is ${otp}</p>`,
      }),
    },
  };
});

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/security/clientIp", () => ({
  getClientIp: jest.fn(() => "192.168.1.1"),
}));

jest.mock("@/models/User", () => {
  mockUser = { findOne: jest.fn(), create: jest.fn(), findByIdAndUpdate: jest.fn() };
  return { __esModule: true, default: mockUser };
});

jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: mockJobSeeker }));

jest.mock("@/models/PendingSignin", () => {
  mockPendingSignin = { findOneAndUpdate: jest.fn().mockResolvedValue({}) };
  return {
    __esModule: true,
    default: mockPendingSignin,
    PENDING_SIGNIN_TTL_MS: 10 * 60 * 1000,
    PENDING_SIGNIN_MAX_ATTEMPTS: 5,
  };
});

function otpReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/auth/apply-otp/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function noUser() {
  mockUser.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
}

function existingUser(overrides: Record<string, unknown>) {
  mockUser.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: "existing-id",
      name: "Jane",
      email: "jane@example.com",
      role: "job_seeker",
      isActive: true,
      ...overrides,
    }),
  });
}

describe("POST /api/auth/apply-otp/start", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    const module = await import("@/app/api/auth/apply-otp/start/route");
    POST = module.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60000 });
    mockVerifyRecaptcha.mockResolvedValue({ ok: true, skipped: true });
    mockPendingSignin.findOneAndUpdate.mockResolvedValue({});
    mockSendEmail.mockResolvedValue({ success: true });
  });

  it("unknown email: stores a hashed pending code and emails it, creating NO account", async () => {
    noUser();

    const res = await POST(otpReq({ email: "John@Example.com", name: "John Smith" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });

    // The whole point of the rewrite: nothing permanent is minted here.
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockJobSeeker.create).not.toHaveBeenCalled();
    expect(mockJobSeeker.updateOne).not.toHaveBeenCalled();

    expect(mockPendingSignin.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = mockPendingSignin.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ email: "john@example.com" });
    expect(opts).toEqual({ upsert: true });
    // Hashed with the "signin" purpose, never the plaintext code and never the
    // signup-verification digest.
    expect(update.$set.otpHash).toMatch(/^hashed_signin_\d{6}$/);
    expect(update.$set.attempts).toBe(0);
    expect(update.$set.requestIp).toBe("192.168.1.1");
    // The typed name becomes the account's name when the code is redeemed.
    expect(update.$set.name).toBe("John Smith");
    const ttl = update.$set.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "john@example.com", source: "quick-apply", category: "system" }),
    );
    // No account yet: greet by the name typed, never the email's local part.
    expect(mockSendEmail.mock.calls[0][0].html).toContain("Hi John Smith,");
    expect(mockSendEmail.mock.calls[0][0].html).not.toContain("Hi john,");
  });

  it("existing job_seeker: emails a code without touching the User document", async () => {
    existingUser({});

    const res = await POST(otpReq({ email: "jane@example.com", name: "Someone Else" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });

    expect(mockPendingSignin.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockUser.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jane@example.com" }));
    expect(mockSendEmail.mock.calls[0][0].html).toContain("Hi Jane,");
  });

  it.each([
    ["employer", { role: "employer" }],
    ["agent", { role: "agent" }],
    ["admin", { role: "admin" }],
    ["deactivated seeker", { role: "job_seeker", isActive: false }],
  ])("%s: same 200 body, no code stored, no email (anti-enumeration)", async (_label, overrides) => {
    existingUser(overrides);

    const res = await POST(otpReq({ email: "jane@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });

    expect(mockPendingSignin.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_EMAIL for a malformed email", async () => {
    const res = await POST(otpReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_EMAIL");
    expect(mockUser.findOne).not.toHaveBeenCalled();
    expect(mockPendingSignin.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns 429 RATE_LIMITED when the IP limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });

    const res = await POST(otpReq({ email: "user@example.com" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("RATE_LIMITED");
    expect(mockUser.findOne).not.toHaveBeenCalled();
  });

  it("per-email limit exceeded: masked 200, nothing stored or sent", async () => {
    mockCheckRateLimit.mockImplementation((id: string) =>
      Promise.resolve(
        id.includes("otp-start:")
          ? { allowed: false, remaining: 0, resetAt: Date.now() + 60000 }
          : { allowed: true, remaining: 10, resetAt: Date.now() + 60000 },
      ),
    );

    const res = await POST(otpReq({ email: "user@example.com" }));
    expect(res.status).toBe(200);
    expect((await res.json()).sent).toBe(true);
    expect(mockUser.findOne).not.toHaveBeenCalled();
    expect(mockPendingSignin.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 502 EMAIL_FAILED when the mailer rejects; nothing permanent to roll back", async () => {
    noUser();
    mockSendEmail.mockRejectedValueOnce(new Error("SMTP error"));

    const res = await POST(otpReq({ email: "test@example.com" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("EMAIL_FAILED");
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  describe("reCAPTCHA gate", () => {
    it("passes the client token and the 'quick_apply' action to the verifier", async () => {
      noUser();

      await POST(otpReq({ email: "user@example.com", captchaToken: "tok-123" }));

      expect(mockVerifyRecaptcha).toHaveBeenCalledWith(
        "tok-123",
        expect.objectContaining({ action: "quick_apply", hostname: "localhost" }),
      );
    });

    it("403 CAPTCHA_REQUIRED / CAPTCHA_FAILED stops before the per-email limit and the DB", async () => {
      mockVerifyRecaptcha.mockResolvedValueOnce({ ok: false, status: 403, error: "CAPTCHA_FAILED" });

      const res = await POST(otpReq({ email: "user@example.com", captchaToken: "bad" }));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("CAPTCHA_FAILED");

      // Only the IP limiter ran; a bot must not burn the address's send budget.
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
      expect(mockUser.findOne).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("503 CAPTCHA_UNAVAILABLE when the verifier cannot be reached (fail closed)", async () => {
      mockVerifyRecaptcha.mockResolvedValueOnce({ ok: false, status: 503, error: "CAPTCHA_UNAVAILABLE" });

      const res = await POST(otpReq({ email: "user@example.com", captchaToken: "tok" }));
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("CAPTCHA_UNAVAILABLE");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  it("staff and seeker branches take the same minimum time (no timing oracle)", async () => {
    // Staff: one DB read then return. Seeker: DB read + upsert + mailer. Without
    // the floor the first is measurably faster, which reveals which addresses
    // hold privileged accounts.
    existingUser({ role: "admin" });
    const t0 = Date.now();
    await POST(otpReq({ email: "admin@example.com" }));
    const staffMs = Date.now() - t0;

    existingUser({});
    const t1 = Date.now();
    await POST(otpReq({ email: "jane@example.com" }));
    const seekerMs = Date.now() - t1;

    expect(staffMs).toBeGreaterThanOrEqual(950);
    expect(seekerMs).toBeGreaterThanOrEqual(950);
  });
});
