/**
 * @jest-environment node
 *
 * POST /api/auth/oauth-2fa/verify is the one sign-in that does not go through
 * the jwt callback: it builds the full session token itself. The token must
 * carry the sign-in time (`authAt`) the callback stamps everywhere else.
 * Without it, an account whose unproven password was removed
 * (lib/auth/unprovenPassword.ts sets `sessionsValidAfter`) signed its owner
 * out at the first re-check after every Google / LinkedIn / Apple + 2FA login:
 * a token with no sign-in time counts as older than the removal.
 */
import { NextRequest } from "next/server";

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";

const encode = jest.fn(async (..._args: unknown[]) => "encoded-session");
jest.mock("next-auth/jwt", () => ({
  __esModule: true,
  encode: (...a: unknown[]) => encode(...a),
  getToken: jest.fn(async () => ({ provider: "firebase" })),
}));
jest.mock("@/lib/auth/config", () => ({
  __esModule: true,
  auth: jest.fn(async () => ({ user: { pending2fa: true, pending2faUserId: "user-1" } })),
}));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/gdpr/termsVersion", () => ({
  __esModule: true,
  getCurrentTermsVersion: jest.fn().mockResolvedValue("v1"),
  termsPendingFor: jest.fn(() => false),
}));
jest.mock("@/lib/security/encryption", () => ({ __esModule: true, decrypt: jest.fn(() => "totp-secret") }));
const verifyTotp = jest.fn((..._args: unknown[]) => true);
jest.mock("@/lib/security/totp", () => ({
  __esModule: true,
  verifyTotp: (...a: unknown[]) => verifyTotp(...a),
  hashRecoveryCode: jest.fn(() => "hash"),
}));
jest.mock("@/lib/security/rateLimit", () => ({
  __esModule: true,
  checkRateLimit: jest.fn(async () => ({ allowed: true, resetAt: Date.now() + 1000 })),
}));
jest.mock("@/lib/audit/log", () => ({ __esModule: true, logActivity: jest.fn() }));

const account = {
  _id: "user-1",
  role: "admin",
  locale: "en",
  email: "owner@example.org",
  name: "Owner",
  isActive: true,
  isEmailVerified: true,
  twoFactorEnabled: true,
  twoFactorSecretEnc: "enc",
  twoFactorRecoveryCodes: [],
};
jest.mock("@/models/User", () => ({
  __esModule: true,
  User: {
    // Awaited directly for the TOTP check, and with .lean() for the identity.
    findById: jest.fn(() => ({ select: () => Object.assign(Promise.resolve(account), { lean: async () => account }) })),
    findByIdAndUpdate: jest.fn(),
  },
}));

import { POST } from "@/app/api/auth/oauth-2fa/verify/route";

const verify = () =>
  POST(
    new NextRequest("http://localhost/api/auth/oauth-2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    }),
  );

beforeEach(() => {
  encode.mockClear();
  verifyTotp.mockReturnValue(true);
});

it("stamps the sign-in time on the session it issues", async () => {
  const before = Math.floor(Date.now() / 1000);
  const res = await verify();

  expect(res.status).toBe(200);
  const { token } = encode.mock.calls[0][0] as { token: { id: string; authAt?: number; authAtMs?: number } };
  expect(token.id).toBe("user-1");
  expect(typeof token.authAt).toBe("number");
  expect(token.authAt).toBeGreaterThanOrEqual(before);
  expect(token.authAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  // The session cut-off compares in ms (lib/auth/sessionCutOff.ts).
  expect(typeof token.authAtMs).toBe("number");
  expect(Math.floor((token.authAtMs as number) / 1000)).toBeGreaterThanOrEqual(token.authAt as number);
});

it("issues nothing for a wrong code", async () => {
  verifyTotp.mockReturnValue(false);
  const res = await verify();

  expect(res.status).toBe(400);
  expect(encode).not.toHaveBeenCalled();
});
