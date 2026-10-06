/**
 * @jest-environment node
 *
 * QA retest 2026-10-06 (bug 2, "dashboard needs a hard refresh after email
 * verification"). The verify page refreshes its own session, but a session in
 * another browser — the link opened on a phone — kept isEmailVerified=false:
 * the 5-minute DB re-check refreshed role and permissions, not this flag, so
 * the proxy kept bouncing that session to /verify-email until sign-out.
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
  mockGetCurrentTermsVersion.mockResolvedValue("v1");
});

function dbUser(fields: Record<string, unknown>) {
  mockUserFindById.mockReturnValue({
    select: (projection: string) => {
      expect(projection.split(" ")).toContain("isEmailVerified");
      return { lean: () => Promise.resolve({ isActive: true, role: "job_seeker", termsAcceptedVersion: "v1", ...fields }) };
    },
  });
}

describe("isEmailVerified on the 5-minute re-check", () => {
  it("turns true once the address was verified elsewhere", async () => {
    dbUser({ isEmailVerified: true });
    const token = await jwt({
      token: { id: "user-1", role: "job_seeker", sid: "s1", iat: nowSec() - 600, lastDbCheck: nowSec() - 600, isEmailVerified: false },
    });
    expect(token).toMatchObject({ isEmailVerified: true });
    const s = await session({ session: { user: {} }, token: token! });
    expect(s.user.isEmailVerified).toBe(true);
  });

  it("leaves the flag alone when the record doesn't say", async () => {
    dbUser({});
    const token = await jwt({
      token: { id: "user-1", role: "job_seeker", sid: "s1", iat: nowSec() - 600, lastDbCheck: nowSec() - 600, isEmailVerified: true },
    });
    expect(token).toMatchObject({ isEmailVerified: true });
  });

  it("does not hit the database between checks", async () => {
    await jwt({
      token: { id: "user-1", role: "job_seeker", sid: "s1", iat: nowSec() - 60, lastDbCheck: nowSec() - 60, isEmailVerified: false },
    });
    expect(mockUserFindById).not.toHaveBeenCalled();
  });
});
