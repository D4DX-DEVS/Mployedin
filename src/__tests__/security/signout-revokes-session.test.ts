/**
 * @jest-environment node
 *
 * Wiring for sign-out revocation in authConfig: every sign-in carries a session
 * id, sign-out records it, and a revoked id ends the session on the next read.
 */

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
process.env.NEXTAUTH_URL = "http://localhost:3000";

const isSessionRevoked = jest.fn();
const revokeSession = jest.fn().mockResolvedValue(undefined);

jest.mock("next-auth", () => ({
  __esModule: true,
  default: () => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }),
  CredentialsSignin: class CredentialsSignin extends Error { code = "credentials"; },
}));
jest.mock("next-auth/providers/credentials", () => ({ __esModule: true, default: () => ({ id: "credentials" }) }));
jest.mock("next-auth/providers/linkedin", () => ({ __esModule: true, default: () => ({ id: "linkedin" }) }));
jest.mock("next-auth/providers/apple", () => ({ __esModule: true, default: () => ({ id: "apple" }) }));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  User: { findById: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  default: { findById: jest.fn() },
}));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn(), findById: jest.fn() } }));
jest.mock("@/models/CompanyUser", () => ({ __esModule: true, CompanyUser: {}, getDefaultPermissions: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ __esModule: true, logActivity: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ __esModule: true, sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/firebase/admin", () => ({ __esModule: true, getFirebaseAdminAuth: jest.fn() }));
jest.mock("@/lib/storage/rehost-avatar", () => ({ __esModule: true, rehostExternalAvatar: jest.fn() }));
jest.mock("@/lib/auth/linkedin-profile", () => ({ __esModule: true, fetchLinkedInExtras: jest.fn() }));
jest.mock("@/lib/security/encryption", () => ({ __esModule: true, encrypt: jest.fn(), decrypt: jest.fn() }));
jest.mock("@/lib/security/totp", () => ({ __esModule: true, verifyTotp: jest.fn(), hashRecoveryCode: jest.fn() }));
jest.mock("@/lib/security/rateLimit", () => ({ __esModule: true, checkRateLimit: jest.fn() }));
jest.mock("@/lib/employers/company-membership", () => ({ __esModule: true, ensureEmployerOwnerMembership: jest.fn() }));
jest.mock("@/lib/auth/sessionRevocation", () => ({
  __esModule: true,
  isSessionRevoked: (...a: unknown[]) => isSessionRevoked(...a),
  revokeSession: (...a: unknown[]) => revokeSession(...a),
}));

import { authConfig } from "@/lib/auth/config";

type JwtFn = (params: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
const jwt = authConfig.callbacks!.jwt as unknown as JwtFn;
const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  isSessionRevoked.mockReset();
  revokeSession.mockClear();
});

describe("sign-out revokes the session", () => {
  it("issues a session id at sign-in", async () => {
    const out = await jwt({ token: {}, user: { id: "u1", role: "employer" } });
    expect(typeof out?.sid).toBe("string");
    expect((out!.sid as string).length).toBeGreaterThanOrEqual(16);
  });

  it("gives each sign-in its own session id", async () => {
    const a = await jwt({ token: {}, user: { id: "u1", role: "employer" } });
    const b = await jwt({ token: {}, user: { id: "u1", role: "employer" } });
    expect(a!.sid).not.toBe(b!.sid);
  });

  it("ends a session whose id has been revoked", async () => {
    isSessionRevoked.mockResolvedValue(true);
    const token = { id: "u1", sid: "sid-x", iat: nowSec(), lastDbCheck: nowSec() };
    expect(await jwt({ token })).toBeNull();
    expect(isSessionRevoked).toHaveBeenCalledWith("sid-x");
  });

  it("keeps a session that has not been revoked", async () => {
    isSessionRevoked.mockResolvedValue(false);
    const token = { id: "u1", sid: "sid-y", iat: nowSec(), lastDbCheck: nowSec() };
    expect(await jwt({ token })).toEqual(expect.objectContaining({ sid: "sid-y" }));
  });

  it("records the session id on sign-out", async () => {
    const exp = nowSec() + 3600;
    await authConfig.events!.signOut!({ token: { id: "u1", sid: "sid-z", exp } } as never);
    expect(revokeSession).toHaveBeenCalledWith("sid-z", exp, "u1");
  });
});
