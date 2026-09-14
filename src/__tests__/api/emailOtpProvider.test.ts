/**
 * @jest-environment node
 *
 * Regression tests for the "email-otp" Credentials provider's authorize()
 * (src/lib/auth/config.ts, id: "email-otp") — the passwordless quick-apply
 * sign-in used by anonymous candidates arriving from a shared job link.
 *
 * The provider redeems a code from PendingSignin (written by
 * /api/auth/apply-otp/start) and is the ONLY place a quick-apply account is
 * created. next-auth is ESM (jest can't parse it) and pulls in a large
 * dependency graph, so every import config.ts makes is mocked to keep this a
 * pure unit test of authorize().
 */

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
process.env.NEXTAUTH_URL = "http://localhost:3000";

const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();
const mockUserFindByIdAndUpdate = jest.fn();
const mockJobSeekerFindOne = jest.fn();
const mockJobSeekerUpdateOne = jest.fn();
const mockPendingFindOne = jest.fn();
const mockPendingDeleteOne = jest.fn();
const mockPendingUpdateOne = jest.fn();
const mockPendingFindOneAndDelete = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockAutoAssign = jest.fn();
const mockLogActivity = jest.fn();
const mockHashOtp = jest.fn((otp: string, purpose?: string) => `hashed_${purpose ?? "verify"}_${otp}`);

jest.mock("next-auth", () => ({
  __esModule: true,
  default: () => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }),
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));
// Pass the config object straight through — we pick the real "email-otp"
// provider out of authConfig.providers by id.
jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: (config: unknown) => config,
}));
jest.mock("next-auth/providers/linkedin", () => ({ __esModule: true, default: () => ({ id: "linkedin" }) }));
jest.mock("next-auth/providers/apple", () => ({ __esModule: true, default: () => ({ id: "apple" }) }));

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/models/User", () => {
  const model = {
    findOne: (...a: unknown[]) => mockUserFindOne(...a),
    findByIdAndUpdate: (...a: unknown[]) => mockUserFindByIdAndUpdate(...a),
    create: (...a: unknown[]) => mockUserCreate(...a),
  };
  return { __esModule: true, User: model, default: model };
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => mockJobSeekerFindOne(...a),
    updateOne: (...a: unknown[]) => mockJobSeekerUpdateOne(...a),
    create: jest.fn(),
  },
}));
jest.mock("@/models/PendingSignin", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => mockPendingFindOne(...a),
    deleteOne: (...a: unknown[]) => mockPendingDeleteOne(...a),
    updateOne: (...a: unknown[]) => mockPendingUpdateOne(...a),
    findOneAndDelete: (...a: unknown[]) => mockPendingFindOneAndDelete(...a),
  },
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
jest.mock("@/lib/audit/log", () => ({ __esModule: true, logActivity: (...a: unknown[]) => mockLogActivity(...a) }));
jest.mock("@/lib/communications/email", () => ({ __esModule: true, sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/firebase/admin", () => ({ __esModule: true, getFirebaseAdminAuth: jest.fn() }));
jest.mock("@/lib/storage/rehost-avatar", () => ({ __esModule: true, rehostExternalAvatar: jest.fn() }));
jest.mock("@/lib/auth/linkedin-profile", () => ({ __esModule: true, fetchLinkedInExtras: jest.fn() }));
jest.mock("@/lib/security/encryption", () => ({ __esModule: true, encrypt: jest.fn(), decrypt: jest.fn() }));
jest.mock("@/lib/security/totp", () => ({ __esModule: true, verifyTotp: jest.fn(), hashRecoveryCode: jest.fn() }));
jest.mock("@/lib/security/rateLimit", () => ({
  __esModule: true,
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));
jest.mock("@/lib/employers/company-membership", () => ({ __esModule: true, ensureEmployerOwnerMembership: jest.fn() }));
jest.mock("@/lib/referrals/attachJobSeeker", () => ({ __esModule: true, attachJobSeekerReferral: jest.fn() }));
jest.mock("@/lib/subscription/autoAssign", () => ({
  __esModule: true,
  autoAssignDefaultPlan: (...a: unknown[]) => mockAutoAssign(...a),
}));
jest.mock("@/lib/auth/emailVerification", () => {
  const actual = jest.requireActual("@/lib/auth/emailVerification");
  return {
    __esModule: true,
    hashOtp: (otp: string, purpose?: string) => mockHashOtp(otp, purpose),
    // Real constant-time compare, but our fake digests are not hex, so compare
    // plainly here; the helper itself is covered in otpHashesMatch.test.ts.
    otpHashesMatch: (a: string, b: string) => (/^[0-9a-f]+$/i.test(a) ? actual.otpHashesMatch(a, b) : a === b),
  };
});

import { authConfig } from "@/lib/auth/config";

type AuthorizeFn = (credentials: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

const emailOtpProvider = authConfig.providers.find(
  (p) => (p as unknown as { id?: string }).id === "email-otp",
) as unknown as { authorize: AuthorizeFn } | undefined;

if (!emailOtpProvider) {
  throw new Error('"email-otp" provider not found in authConfig.providers — check the id in src/lib/auth/config.ts');
}

const authorize = emailOtpProvider.authorize;

const EMAIL = "candidate@example.com";
const CODE = "123456";

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: "pending-id",
    email: EMAIL,
    otpHash: `hashed_signin_${CODE}`,
    attempts: 0,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    ...overrides,
  };
}

/** Fake Mongoose User document as returned by .select() or .create(). */
function baseUser(overrides: Record<string, unknown> = {}) {
  const user: Record<string, unknown> = {
    _id: "job-seeker-id",
    email: EMAIL,
    name: "Candidate",
    avatar: null,
    locale: "en",
    isActive: true,
    role: "job_seeker",
    isEmailVerified: false,
    lockUntil: null,
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    ...overrides,
  };
  user.isLocked = () => Boolean(user.lockUntil && (user.lockUntil as Date) > new Date());
  return user;
}

function leanTo(value: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function existingUser(user: Record<string, unknown> | null) {
  mockUserFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHashOtp.mockImplementation((otp: string, purpose?: string) => `hashed_${purpose ?? "verify"}_${otp}`);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 300000 });
  mockUserFindByIdAndUpdate.mockResolvedValue({});
  mockJobSeekerFindOne.mockReturnValue(leanTo({ isOnboarded: true }));
  mockJobSeekerUpdateOne.mockResolvedValue({ acknowledged: true });
  mockPendingFindOne.mockResolvedValue(pendingRow());
  mockPendingFindOneAndDelete.mockImplementation(async () => pendingRow());
  mockPendingDeleteOne.mockResolvedValue({ deletedCount: 1 });
  mockPendingUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockAutoAssign.mockResolvedValue(undefined);
});

describe("email-otp Credentials provider — authorize()", () => {
  describe("redeeming a valid code", () => {
    test("existing seeker: signs in, marks verified, returns a populated user", async () => {
      existingUser(baseUser());

      const result = await authorize({ email: EMAIL, otp: CODE });

      expect(result).toMatchObject({ id: "job-seeker-id", email: EMAIL, role: "job_seeker", isEmailVerified: true, isOnboarded: true });
      expect(mockUserCreate).not.toHaveBeenCalled();
      expect(mockAutoAssign).not.toHaveBeenCalled();
      // The signup flow's emailVerification* fields must be left alone.
      const [, update] = mockUserFindByIdAndUpdate.mock.calls[0] as [string, Record<string, unknown>];
      expect(update.$set).toMatchObject({ isEmailVerified: true, failedLoginAttempts: 0, lockUntil: null });
      expect(update).not.toHaveProperty("$unset");
      expect(JSON.stringify(update)).not.toContain("emailVerification");
    });

    test("unknown email: this is where the account is created (User + JobSeeker + default plan)", async () => {
      existingUser(null);
      mockUserCreate.mockResolvedValue(baseUser({ _id: "new-id", name: "candidate", isEmailVerified: true }));

      const result = await authorize({ email: EMAIL, otp: CODE });

      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: EMAIL, role: "job_seeker", isActive: true, isEmailVerified: true }),
      );
      // Never a password field: this account is passwordless by design.
      expect(mockUserCreate.mock.calls[0][0]).not.toHaveProperty("passwordHash");
      expect(mockJobSeekerUpdateOne).toHaveBeenCalledWith(
        { userId: "new-id" },
        expect.objectContaining({ $setOnInsert: expect.objectContaining({ isOnboarded: false }) }),
        { upsert: true },
      );
      expect(mockAutoAssign).toHaveBeenCalledWith("new-id", "job_seeker");
      expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "register.email_otp" }));
      expect(result).toMatchObject({ id: "new-id", email: EMAIL, role: "job_seeker", isOnboarded: false });
    });

    test("the code is consumed atomically (findOneAndDelete on the exact row + hash)", async () => {
      existingUser(baseUser());

      await authorize({ email: EMAIL, otp: CODE });

      expect(mockPendingFindOneAndDelete).toHaveBeenCalledWith({ _id: "pending-id", otpHash: `hashed_signin_${CODE}` });
    });

    test("a concurrent redeem that lost the delete race is refused (single use)", async () => {
      existingUser(baseUser());
      mockPendingFindOneAndDelete.mockResolvedValueOnce(null);

      const result = await authorize({ email: EMAIL, otp: CODE });

      expect(result).toBeNull();
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    test("duplicate-key race on User.create signs into the account that won", async () => {
      const winner = baseUser({ _id: "winner-id" });
      mockUserFindOne
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(winner) });
      mockUserCreate.mockRejectedValueOnce(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));

      const result = await authorize({ email: EMAIL, otp: CODE });

      expect(result).toMatchObject({ id: "winner-id" });
      // Not "new": no profile upsert, no plan, no register event for the loser.
      expect(mockJobSeekerUpdateOne).not.toHaveBeenCalled();
      expect(mockAutoAssign).not.toHaveBeenCalled();
    });

    test("hashes the submitted code with the 'signin' purpose, never the signup digest", async () => {
      existingUser(baseUser());

      await authorize({ email: EMAIL, otp: CODE });

      expect(mockHashOtp).toHaveBeenCalledWith(CODE, "signin");
    });
  });

  describe("refusing", () => {
    test("no pending row for the email → null, nothing created", async () => {
      mockPendingFindOne.mockResolvedValueOnce(null);
      existingUser(null);

      expect(await authorize({ email: EMAIL, otp: CODE })).toBeNull();
      expect(mockUserFindOne).not.toHaveBeenCalled();
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    test("wrong code → null, attempts incremented, row kept", async () => {
      existingUser(baseUser());

      expect(await authorize({ email: EMAIL, otp: "000000" })).toBeNull();

      expect(mockPendingUpdateOne).toHaveBeenCalledWith({ _id: "pending-id" }, { $inc: { attempts: 1 } });
      expect(mockPendingFindOneAndDelete).not.toHaveBeenCalled();
      expect(mockUserCreate).not.toHaveBeenCalled();
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("expired code → null and the row is discarded", async () => {
      mockPendingFindOne.mockResolvedValueOnce(pendingRow({ expiresAt: new Date(Date.now() - 1000) }));
      existingUser(baseUser());

      expect(await authorize({ email: EMAIL, otp: CODE })).toBeNull();
      expect(mockPendingDeleteOne).toHaveBeenCalledWith({ _id: "pending-id" });
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("attempt cap reached → null and the row is discarded even with the right code", async () => {
      mockPendingFindOne.mockResolvedValueOnce(pendingRow({ attempts: 5 }));
      existingUser(baseUser());

      expect(await authorize({ email: EMAIL, otp: CODE })).toBeNull();
      expect(mockPendingDeleteOne).toHaveBeenCalledWith({ _id: "pending-id" });
      expect(mockPendingFindOneAndDelete).not.toHaveBeenCalled();
    });

    test("non-job_seeker account → null (account-takeover boundary)", async () => {
      existingUser(baseUser({ role: "employer" }));

      expect(await authorize({ email: EMAIL, otp: CODE })).toBeNull();
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("inactive account → null", async () => {
      existingUser(baseUser({ isActive: false }));

      expect(await authorize({ email: EMAIL, otp: CODE })).toBeNull();
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("locked account → null (a code must not bypass the password lockout)", async () => {
      existingUser(baseUser({ lockUntil: new Date(Date.now() + 15 * 60 * 1000) }));

      expect(await authorize({ email: EMAIL, otp: CODE })).toBeNull();
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("2FA-enrolled account → null (a code must not bypass TOTP)", async () => {
      existingUser(baseUser({ twoFactorEnabled: true }));

      expect(await authorize({ email: EMAIL, otp: CODE })).toBeNull();
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("per-email rate limit denies before the pending row is read", async () => {
      mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 300000 });

      expect(await authorize({ email: EMAIL, otp: CODE })).toBeNull();
      expect(mockPendingFindOne).not.toHaveBeenCalled();
    });

    test("malformed credentials → null without touching the DB", async () => {
      expect(await authorize({ email: "nope", otp: "12" })).toBeNull();
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
      expect(mockPendingFindOne).not.toHaveBeenCalled();
    });
  });
});
