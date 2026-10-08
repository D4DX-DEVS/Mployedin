/**
 * @jest-environment node
 *
 * 2026-09-28 OWASP assessment:
 *  H-07 — LinkedIn / Apple sign-in attached to any existing account whose
 *         email matched, without checking the provider verified that email,
 *         and kept signing in a *different* provider account for the same
 *         email after the first link.
 *  H-08 — Pre-account hijacking: an attacker registers victim@x with their
 *         own password (unverified); the victim later signs in with a social
 *         provider, the account becomes verified, and the attacker's password
 *         keeps working.
 */
import { decideOAuthLink, providerEmailVerified } from "@/lib/auth/oauthLinking";

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
process.env.NEXTAUTH_URL = "http://localhost:3000";

describe("decideOAuthLink", () => {
  const seeker = { role: "job_seeker", isEmailVerified: true, hasPassword: true };

  it("refuses to create or link an account on an unverified provider email", () => {
    expect(decideOAuthLink({ provider: "linkedin", providerAccountId: "s1", emailVerified: false, existing: null }))
      .toEqual({ allow: false, reason: "email_unverified" });
    expect(decideOAuthLink({ provider: "linkedin", providerAccountId: "s1", emailVerified: false, existing: seeker }))
      .toEqual({ allow: false, reason: "email_unverified" });
  });

  it("matches on the stored subject once linked — a second provider account with the same email is refused", () => {
    const linked = { ...seeker, linkedinSub: "victim-sub" };
    expect(decideOAuthLink({ provider: "linkedin", providerAccountId: "attacker-sub", emailVerified: true, existing: linked }))
      .toEqual({ allow: false, reason: "subject_mismatch" });
    expect(decideOAuthLink({ provider: "linkedin", providerAccountId: "victim-sub", emailVerified: false, existing: linked }))
      .toEqual({ allow: true, linkSubject: false, discardPassword: false });
  });

  it("never auto-links staff accounts", () => {
    for (const role of ["admin", "super_agent", "agent"]) {
      expect(decideOAuthLink({ provider: "apple", providerAccountId: "s", emailVerified: true, existing: { ...seeker, role } }))
        .toEqual({ allow: false, reason: "staff_account" });
    }
  });

  it("discards a password set on an unverified account when the owner proves the email", () => {
    expect(decideOAuthLink({
      provider: "linkedin", providerAccountId: "s", emailVerified: true,
      existing: { role: "job_seeker", isEmailVerified: false, hasPassword: true },
    })).toEqual({ allow: true, linkSubject: true, discardPassword: true });
    expect(decideOAuthLink({ provider: "linkedin", providerAccountId: "s", emailVerified: true, existing: seeker }))
      .toEqual({ allow: true, linkSubject: true, discardPassword: false });
  });

  it("reads email_verified as boolean or string", () => {
    expect(providerEmailVerified({ email_verified: true })).toBe(true);
    expect(providerEmailVerified({ email_verified: "true" })).toBe(true);
    expect(providerEmailVerified({ email_verified: false })).toBe(false);
    expect(providerEmailVerified({})).toBe(false);
    expect(providerEmailVerified(undefined)).toBe(false);
  });
});

// ── The jwt callback applies the decision ────────────────────────────────────

const mockFindOne = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockCreate = jest.fn();

jest.mock("next-auth", () => ({
  __esModule: true,
  default: () => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }),
  CredentialsSignin: class CredentialsSignin extends Error { code = "credentials"; },
}));
jest.mock("next-auth/providers/credentials", () => ({ __esModule: true, default: () => ({ id: "credentials" }) }));
jest.mock("next-auth/providers/linkedin", () => ({ __esModule: true, default: () => ({ id: "linkedin" }) }));
jest.mock("next-auth/providers/apple", () => ({ __esModule: true, default: () => ({ id: "apple" }) }));
jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/models/User", () => {
  const api = {
    findOne: (...a: unknown[]) => mockFindOne(...a),
    findByIdAndUpdate: (...a: unknown[]) => mockFindByIdAndUpdate(...a),
    create: (...a: unknown[]) => mockCreate(...a),
    findById: jest.fn(),
    updateOne: jest.fn(),
  };
  return { __esModule: true, User: api, default: api };
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ isOnboarded: true }) }) })),
    create: jest.fn(),
  },
}));
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

type JwtFn = (params: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
let jwt: JwtFn;
beforeAll(async () => {
  const { authConfig } = await import("@/lib/auth/config");
  jwt = authConfig.callbacks!.jwt as unknown as JwtFn;
});

function existing(doc: Record<string, unknown>) {
  mockFindOne.mockReturnValue({ select: async () => ({ _id: "u1", isActive: true, ...doc }) });
}

function signIn(provider: "linkedin" | "apple", sub: string, emailVerified: unknown) {
  return jwt({
    token: { email: "victim@x.test", name: "V" },
    user: { id: "u1", email: "victim@x.test" },
    account: { provider, providerAccountId: sub, type: "oidc" },
    profile: { email: "victim@x.test", email_verified: emailVerified },
  });
}

beforeEach(() => {
  mockFindOne.mockReset();
  mockFindByIdAndUpdate.mockReset();
  mockCreate.mockReset();
});

describe("jwt callback — social sign-in", () => {
  it("rejects LinkedIn when the provider did not verify the email", async () => {
    existing({ role: "job_seeker", isEmailVerified: true, passwordHash: "h" });
    expect(await signIn("linkedin", "sub-1", false)).toBeNull();
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects a different LinkedIn account for an already-linked email", async () => {
    existing({ role: "employer", isEmailVerified: true, linkedinSub: "victim-sub" });
    expect(await signIn("linkedin", "attacker-sub", true)).toBeNull();
  });

  it("rejects auto-linking onto an admin account", async () => {
    existing({ role: "admin", isEmailVerified: true, passwordHash: "h" });
    expect(await signIn("apple", "sub-1", "true")).toBeNull();
  });

  it("drops a pre-registered password when the real owner links LinkedIn", async () => {
    existing({ role: "job_seeker", isEmailVerified: false, passwordHash: "attacker-hash" });
    await signIn("linkedin", "sub-1", true);
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith("u1", expect.objectContaining({
      $unset: expect.objectContaining({ passwordHash: 1 }),
      $set: expect.objectContaining({ linkedinSub: "sub-1", isEmailVerified: true, passwordChangedAt: expect.any(Date) }),
    }));
  });

  it("refuses to create a new account from an unverified email", async () => {
    mockFindOne.mockReturnValue({ select: async () => null });
    expect(await signIn("linkedin", "sub-1", false)).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
