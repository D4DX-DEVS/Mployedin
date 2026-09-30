/**
 * @jest-environment node
 *
 * session.user.termsPending drives the proxy's /accept-terms gate. The jwt
 * callback sets it at sign-in, refreshes it on the 5-minute DB re-check (so a
 * new version an admin starts reaches live sessions) and on update() after
 * /accept-terms — always from the database, never from the client payload.
 */

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
process.env.NEXTAUTH_URL = "http://localhost:3000";

const mockUserFindById = jest.fn();
const mockIsTermsAcceptancePending = jest.fn();
const mockGetCurrentTermsVersion = jest.fn();

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
jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/models/User", () => {
  const model = {
    findOne: jest.fn(),
    findById: (...a: unknown[]) => mockUserFindById(...a),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
    exists: jest.fn(),
  };
  return { __esModule: true, User: model, default: model };
});
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findOne: jest.fn(), updateOne: jest.fn(), create: jest.fn() } }));
jest.mock("@/models/PendingSignin", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), deleteOne: jest.fn(), updateOne: jest.fn(), findOneAndDelete: jest.fn() },
  PENDING_SIGNIN_TTL_MS: 10 * 60 * 1000,
  PENDING_SIGNIN_MAX_ATTEMPTS: 5,
}));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn(), findById: jest.fn() } }));
jest.mock("@/models/CompanyUser", () => ({
  __esModule: true,
  CompanyUser: {},
  getDefaultPermissions: jest.fn(),
  computeEffectivePermissions: jest.fn(),
}));
jest.mock("@/lib/audit/log", () => ({ __esModule: true, logActivity: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/lib/communications/email", () => ({ __esModule: true, sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/firebase/admin", () => ({ __esModule: true, getFirebaseAdminAuth: jest.fn() }));
jest.mock("@/lib/storage/rehost-avatar", () => ({ __esModule: true, rehostExternalAvatar: jest.fn() }));
jest.mock("@/lib/auth/linkedin-profile", () => ({ __esModule: true, fetchLinkedInExtras: jest.fn() }));
jest.mock("@/lib/security/encryption", () => ({ __esModule: true, encrypt: jest.fn(), decrypt: jest.fn() }));
jest.mock("@/lib/security/totp", () => ({ __esModule: true, verifyTotp: jest.fn(), hashRecoveryCode: jest.fn() }));
jest.mock("@/lib/security/rateLimit", () => ({ __esModule: true, checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock("@/lib/employers/company-membership", () => ({ __esModule: true, ensureEmployerOwnerMembership: jest.fn() }));
jest.mock("@/lib/gdpr/consent", () => ({ __esModule: true, recordRegistrationConsents: jest.fn() }));
jest.mock("@/lib/auth/sessionRevocation", () => ({ __esModule: true, isSessionRevoked: jest.fn().mockResolvedValue(false), revokeSession: jest.fn() }));
jest.mock("@/lib/auth/companyContext", () => ({ __esModule: true, resolveCompanyContext: jest.fn().mockResolvedValue(null) }));
jest.mock("next/headers", () => ({ __esModule: true, cookies: jest.fn(async () => ({ get: () => undefined })) }));
jest.mock("@/lib/referrals/attachJobSeeker", () => ({ __esModule: true, attachJobSeekerReferral: jest.fn() }));
jest.mock("@/lib/subscription/autoAssign", () => ({ __esModule: true, autoAssignDefaultPlan: jest.fn() }));
jest.mock("@/lib/auth/emailVerification", () => ({ __esModule: true, hashOtp: jest.fn(), otpHashesMatch: jest.fn() }));
jest.mock("@/lib/gdpr/termsVersion", () => ({
  __esModule: true,
  isTermsAcceptancePending: (...a: unknown[]) => mockIsTermsAcceptancePending(...a),
  getCurrentTermsVersion: () => mockGetCurrentTermsVersion(),
  termsPendingFor: jest.requireActual("@/lib/gdpr/termsVersion").termsPendingFor,
}));

import { authConfig } from "@/lib/auth/config";

type JwtFn = (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
type SessionFn = (args: Record<string, unknown>) => Promise<{ user: Record<string, unknown> }>;
const jwt = authConfig.callbacks!.jwt as unknown as JwtFn;
const session = authConfig.callbacks!.session as unknown as SessionFn;

const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentTermsVersion.mockResolvedValue("v2");
});

describe("termsPending on the token", () => {
  it("is set at sign-in from the database", async () => {
    mockIsTermsAcceptancePending.mockResolvedValue(true);
    const token = await jwt({
      token: {},
      user: { id: "user-1", role: "agent" },
      trigger: "signIn",
      account: { provider: "credentials" },
    });
    expect(mockIsTermsAcceptancePending).toHaveBeenCalledWith("user-1", "agent");
    expect(token).toMatchObject({ termsPending: true });
  });

  it("fails open at sign-in when the lookup errors", async () => {
    mockIsTermsAcceptancePending.mockRejectedValue(new Error("db down"));
    const token = await jwt({ token: {}, user: { id: "user-1", role: "agent" }, account: { provider: "credentials" } });
    expect(token).toMatchObject({ termsPending: false });
  });

  it("is re-read, not taken from the payload, on update()", async () => {
    mockIsTermsAcceptancePending.mockResolvedValue(true);
    const token = await jwt({
      token: { id: "user-1", role: "agent", sid: "s1", termsPending: true },
      trigger: "update",
      session: { termsAccepted: true, termsPending: false },
    });
    expect(token).toMatchObject({ termsPending: true });

    mockIsTermsAcceptancePending.mockResolvedValue(false);
    const accepted = await jwt({
      token: { id: "user-1", role: "agent", sid: "s1", termsPending: true },
      trigger: "update",
      session: { termsAccepted: true },
    });
    expect(accepted).toMatchObject({ termsPending: false });
  });

  it("keeps the old value when the refresh fails", async () => {
    mockIsTermsAcceptancePending.mockRejectedValue(new Error("db down"));
    const token = await jwt({
      token: { id: "user-1", role: "agent", sid: "s1", termsPending: true },
      trigger: "update",
      session: { termsAccepted: true },
    });
    expect(token).toMatchObject({ termsPending: true });
  });

  it("picks up a new version on the 5-minute re-check", async () => {
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ isActive: true, role: "employer", termsAcceptedVersion: "v1" }) }),
    });
    const token = await jwt({
      token: { id: "user-1", role: "employer", sid: "s1", iat: nowSec() - 600, lastDbCheck: nowSec() - 600, termsPending: false },
    });
    expect(token).toMatchObject({ termsPending: true });
  });

  it("never gates an admin on the re-check", async () => {
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ isActive: true, role: "admin" }) }),
    });
    const token = await jwt({
      token: { id: "user-1", role: "admin", sid: "s1", iat: nowSec() - 600, lastDbCheck: nowSec() - 600 },
    });
    expect(token).toMatchObject({ termsPending: false });
  });

  it("reaches session.user for the proxy", async () => {
    const s = await session({ session: { user: {} }, token: { id: "user-1", role: "agent", termsPending: true } });
    expect(s.user.termsPending).toBe(true);
  });
});
