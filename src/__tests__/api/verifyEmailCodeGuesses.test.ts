/**
 * @jest-environment node
 *
 * Someone who registered another person's address knows the password; only the
 * mailbox proof is missing, and a lucky guess at the 6-digit code supplied it.
 * The per-address limit (5 per 5 minutes) reset every window for the code's
 * whole 24 hours: about 1,440 guesses per code. Each code now takes 5 wrong
 * guesses in total, then stops working (the link in the same mail still does),
 * and an address gets at most 5 new codes a day.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const checkRateLimit = jest.fn(async (..._a: unknown[]) => ({ allowed: true, resetAt: Date.now() + 1000 }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m1" });
jest.mock("@/lib/communications/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  EmailTemplates: { verifyEmailOtp: jest.fn(() => ({ subject: "s", html: "h" })) },
}));
let session: unknown = { user: { id: "user-1", email: "owner@example.org" } };
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => session) }));

const findOne = jest.fn();
const findOneAndUpdate = jest.fn();
const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
jest.mock("@/models/User", () => ({
  User: {
    findOne: (...a: unknown[]) => findOne(...a),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a),
    updateOne: (...a: unknown[]) => updateOne(...a),
  },
}));

import { hashOtp } from "@/lib/auth/emailVerification";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as resend } from "@/app/api/auth/resend-verification/route";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

type Doc = Record<string, unknown> & { save: jest.Mock };
function account(fields: Record<string, unknown> = {}): Doc {
  return {
    _id: { toString: () => "user-1" },
    email: "owner@example.org",
    name: "Owner",
    role: "job_seeker",
    isEmailVerified: false,
    emailVerificationOtp: hashOtp("123456"),
    emailVerificationExpiry: new Date(Date.now() + 60 * 60_000),
    emailVerificationAttempts: 0,
    save: jest.fn().mockResolvedValue(undefined),
    ...fields,
  };
}
const found = (doc: Doc | null) => findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(doc) });
const tryCode = (otp: string) => verifyEmail(post("/api/auth/verify-email", { otp, email: "owner@example.org" }));

beforeEach(() => {
  jest.clearAllMocks();
  session = { user: { id: "user-1", email: "owner@example.org" } };
  checkRateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 1000 });
});

describe("POST /api/auth/verify-email with a code", () => {
  it("counts a wrong code against that code", async () => {
    found(account());
    findOneAndUpdate.mockResolvedValue({ emailVerificationAttempts: 1 });

    const res = await tryCode("000000");

    expect(res.status).toBe(400);
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    // Only while the same code is still the live one.
    expect(filter).toMatchObject({ _id: expect.anything(), emailVerificationOtp: hashOtp("123456") });
    expect(update).toEqual({ $inc: { emailVerificationAttempts: 1 } });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("stops the code after the fifth wrong guess, and says to use the link", async () => {
    found(account({ emailVerificationAttempts: 4 }));
    findOneAndUpdate.mockResolvedValue({ emailVerificationAttempts: 5 });

    const res = await tryCode("000000");

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("CODE_LOCKED");
    expect(updateOne).toHaveBeenCalledWith(
      { _id: expect.anything(), emailVerificationOtp: hashOtp("123456") },
      { $unset: { emailVerificationOtp: "" } },
    );
  });

  it("refuses even the right code once it is used up", async () => {
    const doc = account({ emailVerificationAttempts: 5 });
    found(doc);

    const res = await tryCode("123456");

    expect((await res.json()).code).toBe("CODE_LOCKED");
    expect(doc.isEmailVerified).toBe(false);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("verifies with the right code and clears the count", async () => {
    const doc = account({ emailVerificationAttempts: 2 });
    found(doc);

    const res = await tryCode("123456");

    expect(res.status).toBe(200);
    expect(doc.isEmailVerified).toBe(true);
    expect(doc.emailVerificationAttempts).toBeUndefined();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("gives the same answer for an address with no account or no code", async () => {
    found(null);
    const none = await tryCode("123456");
    found(account({ emailVerificationOtp: undefined }));
    const noCode = await tryCode("123456");

    expect(none.status).toBe(400);
    expect(noCode.status).toBe(400);
    expect((await none.json()).error).toBe((await noCode.json()).error);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/resend-verification", () => {
  it("starts the new code's count at zero", async () => {
    const doc = account({ emailVerificationAttempts: 5, emailVerificationOtp: undefined });
    found(doc);

    await resend(post("/api/auth/resend-verification", { email: "owner@example.org" }));

    expect(doc.emailVerificationAttempts).toBe(0);
    expect(doc.save).toHaveBeenCalled();
  });

  it("sends an address at most five new codes a day, the automatic one included", async () => {
    // Otherwise reloading the page as the account (the stranger is signed in
    // to it) mints a fresh code with five fresh guesses each time.
    const doc = account({ emailVerificationOtp: undefined });
    found(doc);

    await resend(post("/api/auth/resend-verification", { email: "owner@example.org", ifMissing: true }));

    const perAddress = checkRateLimit.mock.calls.find(([key]) => String(key).startsWith("resend-verify-acct:"));
    expect(perAddress).toBeDefined();
    expect(perAddress?.[1]).toMatchObject({ limit: 5, windowSec: 24 * 60 * 60, failClosed: true });

    checkRateLimit.mockImplementation(async (key: unknown) => ({
      allowed: !String(key).startsWith("resend-verify-acct:"),
      resetAt: Date.now() + 1000,
    }));
    const res = await resend(post("/api/auth/resend-verification", { email: "owner@example.org" }));
    expect(res.status).toBe(429);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
