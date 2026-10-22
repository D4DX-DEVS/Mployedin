/**
 * @jest-environment node
 */
/**
 * POST /api/auth/apply-otp/start — the captcha gate goes through the swappable
 * server verifier (lib/security/captcha), not reCAPTCHA directly. The wire
 * behaviour is unchanged: the 'quick_apply' action, 403 CAPTCHA_REQUIRED /
 * CAPTCHA_FAILED, 503 CAPTCHA_UNAVAILABLE, and a refused bot never reaches the
 * per-email limiter, the database or the mailer. (applyOtpStart.test.ts covers
 * the rest of the route with the reCAPTCHA module mocked underneath.)
 */
import { NextRequest } from "next/server";

const mockVerifyCaptcha = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockSendEmail = jest.fn();
const mockFindOne = jest.fn();
const mockUpsert = jest.fn();

jest.mock("@/lib/security/captcha", () => ({ verifyCaptcha: (...a: unknown[]) => mockVerifyCaptcha(...a) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  RATE_LIMIT_CONFIGS: { auth: { limit: 10, windowSec: 60 } },
}));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "192.168.1.1" }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn() }));
jest.mock("@/lib/auth/emailVerification", () => ({ hashOtp: (otp: string) => `hash_${otp}` }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: (...a: unknown[]) => mockSendEmail(...a),
  EmailTemplates: { verifyEmailOtpQuickApply: () => ({ subject: "s", html: "h" }) },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => mockFindOne(...a) } }));
jest.mock("@/models/PendingSignin", () => ({
  __esModule: true,
  default: { findOneAndUpdate: (...a: unknown[]) => mockUpsert(...a) },
  PENDING_SIGNIN_TTL_MS: 600000,
}));

function otpReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/auth/apply-otp/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("apply-otp/start captcha gate (swappable verifier)", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    POST = (await import("@/app/api/auth/apply-otp/start/route")).POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockVerifyCaptcha.mockResolvedValue({ ok: true, skipped: true });
    mockFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    mockUpsert.mockResolvedValue({});
    mockSendEmail.mockResolvedValue({ success: true });
  });

  it("verifies the client's token for action 'quick_apply' on the request's hostname", async () => {
    await POST(otpReq({ email: "user@example.com", name: "User", captchaToken: "tok-9" }));

    expect(mockVerifyCaptcha).toHaveBeenCalledTimes(1);
    expect(mockVerifyCaptcha).toHaveBeenCalledWith("tok-9", { action: "quick_apply", hostname: "localhost" });
  });

  it.each([
    [403, "CAPTCHA_REQUIRED"],
    [403, "CAPTCHA_FAILED"],
    [503, "CAPTCHA_UNAVAILABLE"],
  ])("passes a %i %s refusal through and stops before the per-email limit, the database and the mailer", async (status, error) => {
    mockVerifyCaptcha.mockResolvedValue({ ok: false, status, error });

    const res = await POST(otpReq({ email: "user@example.com", name: "User", captchaToken: "bad" }));

    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(error);
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1); // the IP limiter only
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
