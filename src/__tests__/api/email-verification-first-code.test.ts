/**
 * @jest-environment node
 *
 * An agent added by an admin or super-agent never got a verification code: the
 * create routes mint none, yet the proxy sends the unverified agent to
 * /verify-email, which says "we sent a code". Only "Resend" ever produced one
 * (reported 2026-09-25). The page now asks for a code on arrival (`ifMissing`),
 * which must not replace a live code a registration just sent.
 *
 * Self-registered agents stay inactive until an admin approves them, but the
 * registration email asks them to verify first — the isActive filter made that
 * code, its link and "Resend" all dead ends.
 *
 * A password-setup / reset link is delivered to the inbox, so using it proves
 * the address and must mark it verified.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const checkRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn() }));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m1" });
jest.mock("@/lib/communications/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  EmailTemplates: {
    verifyEmailOtp: jest.fn(() => ({ subject: "s", html: "h" })),
    passwordResetConfirmation: jest.fn(() => ({ subject: "s", html: "h" })),
  },
}));
jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: { genSalt: jest.fn().mockResolvedValue("salt"), hash: jest.fn().mockResolvedValue("hash") },
}));

let sessionEmail: string | null = "agent@mployedin.com";
jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(async () => (sessionEmail ? { user: { email: sessionEmail } } : null)),
}));

const findOne = jest.fn();
const findByIdAndUpdate = jest.fn().mockResolvedValue(null);
jest.mock("@/models/User", () => ({
  User: {
    findOne: (...a: unknown[]) => findOne(...a),
    findByIdAndUpdate: (...a: unknown[]) => findByIdAndUpdate(...a),
  },
}));

import { POST as resend } from "@/app/api/auth/resend-verification/route";
import { POST as verify } from "@/app/api/auth/verify-email/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

function userDoc(fields: Record<string, unknown> = {}): Record<string, unknown> & { email: string; save: jest.Mock } {
  return {
    _id: { toString: () => "u1" },
    email: "agent@mployedin.com",
    name: "Agent",
    role: "agent",
    save: jest.fn().mockResolvedValue(undefined),
    ...fields,
  };
}
const found = (user: unknown) => findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
const lookupFilter = () => findOne.mock.calls[0][0] as Record<string, unknown>;
const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});
beforeEach(() => {
  jest.clearAllMocks();
  sessionEmail = "agent@mployedin.com";
});

describe("resend-verification ifMissing (verify page arrival)", () => {
  it("sends the first code when the account has none", async () => {
    const user = userDoc();
    found(user);
    const res = await resend(post("/api/auth/resend-verification", { email: user.email, ifMissing: true }));
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(user.save).toHaveBeenCalled();
  });

  it("keeps a live code a registration already sent", async () => {
    const user = userDoc({ emailVerificationOtp: "hashed", emailVerificationExpiry: new Date(Date.now() + HOUR) });
    found(user);
    const res = await resend(post("/api/auth/resend-verification", { email: user.email, ifMissing: true }));
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
    expect(user.emailVerificationOtp).toBe("hashed");
  });

  it("replaces an expired code", async () => {
    const user = userDoc({ emailVerificationOtp: "old", emailVerificationExpiry: new Date(Date.now() - HOUR) });
    found(user);
    await resend(post("/api/auth/resend-verification", { email: user.email, ifMissing: true }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not spend the manual Resend budget", async () => {
    found(userDoc());
    await resend(post("/api/auth/resend-verification", { email: "agent@mployedin.com", ifMissing: true }));
    expect(String(checkRateLimit.mock.calls[0][0])).toMatch(/^resend-verify-auto:/);
  });

  // The page fires this on load with no click, so a link to
  // /verify-email?email=<anyone> must not make a visitor's browser mail them.
  it.each([
    ["no session", null],
    ["someone else's session", "other@mployedin.com"],
  ])("sends nothing with %s", async (_label, email) => {
    sessionEmail = email;
    found(userDoc());
    const res = await resend(post("/api/auth/resend-verification", { email: "agent@mployedin.com", ifMissing: true }));
    expect(res.status).toBe(200);
    expect(findOne).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a manual Resend still replaces a live code", async () => {
    const user = userDoc({ emailVerificationOtp: "hashed", emailVerificationExpiry: new Date(Date.now() + HOUR) });
    found(user);
    await resend(post("/api/auth/resend-verification", { email: user.email }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(user.emailVerificationOtp).not.toBe("hashed");
  });
});

describe("agents awaiting approval can verify", () => {
  const allowsPendingAgents = (filter: Record<string, unknown>) => {
    expect(filter.isActive).toBeUndefined();
    expect(filter.$or).toEqual(expect.arrayContaining([{ isActive: true }, { role: "agent" }]));
  };

  it("resend looks past isActive for agents", async () => {
    found(null);
    await resend(post("/api/auth/resend-verification", { email: "agent@mployedin.com" }));
    allowsPendingAgents(lookupFilter());
  });

  it("OTP verification looks past isActive for agents", async () => {
    found(null);
    await verify(post("/api/auth/verify-email", { otp: "123456", email: "agent@mployedin.com" }));
    allowsPendingAgents(lookupFilter());
  });

  it("link verification looks past isActive for agents", async () => {
    found(null);
    await verify(post("/api/auth/verify-email", { token: "abc" }));
    allowsPendingAgents(lookupFilter());
  });
});

describe("reset-password", () => {
  it("marks the email verified — the link was delivered to that inbox", async () => {
    const user = userDoc({ isEmailVerified: false, passwordResetAttempts: 0 });
    found(user);
    const res = await resetPassword(post("/api/auth/reset-password", { token: "setup-token", password: "Str0ng!Passw0rd#" }));
    expect(res.status).toBe(200);
    expect(user.isEmailVerified).toBe(true);
    expect(user.save).toHaveBeenCalled();
  });
});
