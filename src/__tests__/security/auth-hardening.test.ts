/**
 * @jest-environment node
 *
 * Regression tests for auth hardening in src/lib/auth/config.ts:
 *  - SEC-B3: Firebase sign-in accepts only verified-email Google tokens and
 *    honours lockout.
 *  - RL-1:   a stored role outside the enum never mints or keeps a session.
 *  - SEC-E3: the periodic refresh re-resolves (or drops) company claims.
 *  - D:      a bcrypt compare runs even for unknown addresses.
 */

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
process.env.NEXTAUTH_URL = "http://localhost:3000";

const mockUserFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockUserFindByIdAndUpdate = jest.fn().mockResolvedValue(null);
const mockVerifyIdToken = jest.fn();
const mockResolveCompany = jest.fn();
const mockBcryptCompare = jest.fn().mockResolvedValue(false);

jest.mock("next-auth", () => ({
  __esModule: true,
  default: () => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }),
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));
jest.mock("next-auth/providers/credentials", () => ({ __esModule: true, default: (config: unknown) => config }));
jest.mock("next-auth/providers/linkedin", () => ({ __esModule: true, default: () => ({ id: "linkedin" }) }));
jest.mock("next-auth/providers/apple", () => ({ __esModule: true, default: () => ({ id: "apple" }) }));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { compare: (...a: unknown[]) => mockBcryptCompare(...a) } }));
jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/models/User", () => {
  const model = {
    findOne: (...a: unknown[]) => mockUserFindOne(...a),
    findById: (...a: unknown[]) => mockUserFindById(...a),
    findByIdAndUpdate: (...a: unknown[]) => mockUserFindByIdAndUpdate(...a),
    create: jest.fn(),
  };
  return { __esModule: true, User: model, default: model };
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }), create: jest.fn() },
}));
jest.mock("@/models/PendingSignin", () => ({ __esModule: true, default: {}, PENDING_SIGNIN_MAX_ATTEMPTS: 5 }));
jest.mock("@/lib/auth/companyContext", () => ({
  __esModule: true,
  resolveCompanyContext: (...a: unknown[]) => mockResolveCompany(...a),
}));
jest.mock("@/lib/audit/log", () => ({ __esModule: true, logActivity: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ __esModule: true, sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/firebase/admin", () => ({
  __esModule: true,
  getFirebaseAdminAuth: () => ({ verifyIdToken: (...a: unknown[]) => mockVerifyIdToken(...a) }),
}));
jest.mock("@/lib/storage/rehost-avatar", () => ({ __esModule: true, rehostExternalAvatar: jest.fn() }));
jest.mock("@/lib/auth/linkedin-profile", () => ({ __esModule: true, fetchLinkedInExtras: jest.fn() }));
jest.mock("@/lib/security/encryption", () => ({ __esModule: true, encrypt: jest.fn(), decrypt: jest.fn() }));
jest.mock("@/lib/security/totp", () => ({ __esModule: true, verifyTotp: jest.fn(), hashRecoveryCode: jest.fn() }));
jest.mock("@/lib/security/rateLimit", () => ({
  __esModule: true,
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock("@/lib/referrals/attachJobSeeker", () => ({ __esModule: true, attachJobSeekerReferral: jest.fn() }));
jest.mock("@/lib/subscription/autoAssign", () => ({ __esModule: true, autoAssignDefaultPlan: jest.fn() }));
jest.mock("@/lib/auth/sessionRevocation", () => ({
  __esModule: true,
  isSessionRevoked: jest.fn().mockResolvedValue(false),
  revokeSession: jest.fn(),
}));

import { authConfig } from "@/lib/auth/config";

type Authorize = (credentials: Record<string, unknown>, request?: unknown) => Promise<unknown>;
const provider = (id: string) =>
  (authConfig.providers as unknown as { id?: string; authorize: Authorize }[]).find((p) => (p.id ?? "credentials") === id)!;
const jwt = authConfig.callbacks!.jwt as unknown as (p: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

const leanTo = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

const dbUser = (over: Record<string, unknown> = {}) => ({
  _id: { toString: () => "u1" },
  email: "someone@example.com",
  name: "Someone",
  role: "job_seeker",
  isActive: true,
  isLocked: () => false,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("Firebase provider (SEC-B3)", () => {
  const signIn = () => provider("firebase").authorize({ idToken: "tok" });

  it.each([
    ["an unverified email", { email_verified: false, firebase: { sign_in_provider: "google.com" } }],
    ["a password sign-in", { email_verified: true, firebase: { sign_in_provider: "password" } }],
    ["a custom token", { email_verified: true, firebase: { sign_in_provider: "custom" } }],
  ])("rejects %s with oauth_unverified and never touches the account", async (_label, claims) => {
    mockVerifyIdToken.mockResolvedValue({ email: "victim@example.com", ...claims });
    await expect(signIn()).rejects.toMatchObject({ code: "oauth_unverified" });
    expect(mockUserFindOne).not.toHaveBeenCalled();
  });

  it("refuses a locked account", async () => {
    mockVerifyIdToken.mockResolvedValue({ email: "a@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } });
    mockUserFindOne.mockResolvedValue(dbUser({ name: "A", avatar: "x", isLocked: () => true }));
    await expect(signIn()).rejects.toMatchObject({ code: "account_locked" });
    expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses a stored role outside the enum", async () => {
    mockVerifyIdToken.mockResolvedValue({ email: "a@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } });
    mockUserFindOne.mockResolvedValue(dbUser({ name: "A", avatar: "x", role: "superuser" }));
    await expect(signIn()).rejects.toMatchObject({ code: "invalid_role" });
  });

  // 2026-09-28 OWASP H-08: pre-account hijacking. An attacker registers the
  // victim's address with their own password; the account stays unverified
  // until the real owner signs in with Google — whose password must then die.
  it("discards a pre-registered password when Google proves an unverified account", async () => {
    mockVerifyIdToken.mockResolvedValue({ email: "a@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } });
    mockUserFindOne.mockResolvedValue(dbUser({ name: "A", avatar: "x", isEmailVerified: false }));
    await signIn().catch(() => undefined);
    expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({ isEmailVerified: true, passwordChangedAt: expect.any(Date) }),
        $unset: expect.objectContaining({ passwordHash: 1 }),
      }),
    );
  });
});

describe("Credentials provider", () => {
  const signIn = () =>
    provider("credentials").authorize({ email: "a@example.com", password: "password123" }, { headers: new Headers() });

  it("runs a bcrypt compare even when the address is unknown (D)", async () => {
    mockUserFindOne.mockReturnValue({ select: () => Promise.resolve(null) });
    await expect(signIn()).resolves.toBeNull();
    expect(mockBcryptCompare).toHaveBeenCalledTimes(1);
  });

  it("rejects a valid password on an out-of-enum role (RL-1)", async () => {
    mockUserFindOne.mockReturnValue({
      select: () =>
        Promise.resolve(dbUser({ passwordHash: "h", role: "root", comparePassword: jest.fn().mockResolvedValue(true) })),
    });
    await expect(signIn()).rejects.toMatchObject({ code: "invalid_role" });
  });
});

describe("jwt periodic refresh", () => {
  const stale = { id: "u1", sid: "s1", iat: 1, lastDbCheck: 1 };

  it("ends the session when the stored role is outside the enum (RL-1)", async () => {
    mockUserFindById.mockReturnValue(leanTo({ isActive: true, role: "root" }));
    await expect(jwt({ token: { ...stale, role: "employer" } })).resolves.toBeNull();
  });

  it("drops company claims once the membership is gone (SEC-E3)", async () => {
    mockUserFindById.mockReturnValue(leanTo({ isActive: true, role: "employer" }));
    mockResolveCompany.mockResolvedValue(null);
    const out = await jwt({
      token: {
        ...stale,
        role: "employer",
        companyId: "c1",
        companyOwnerUserId: "owner",
        companyPermissions: { canManageTeam: true },
        jobAccess: ["j1"],
      },
    });
    expect(out).not.toBeNull();
    expect(out!.companyId).toBeUndefined();
    expect(out!.companyOwnerUserId).toBeUndefined();
    expect(out!.companyPermissions).toBeUndefined();
    expect(out!.jobAccess).toBeUndefined();
  });

  it("refreshes company claims from the live membership (SEC-E3)", async () => {
    mockUserFindById.mockReturnValue(leanTo({ isActive: true, role: "employer" }));
    mockResolveCompany.mockResolvedValue({
      companyId: "c1",
      companyOwnerUserId: "owner",
      companyUserRole: "viewer",
      companyRoles: ["viewer"],
      permissions: { canManageTeam: false },
      jobAccess: [],
    });
    const out = await jwt({
      token: { ...stale, role: "employer", companyId: "c1", companyPermissions: { canManageTeam: true } },
    });
    expect(out!.companyPermissions).toEqual({ canManageTeam: false });
    expect(out!.companyUserRole).toBe("viewer");
  });
});
