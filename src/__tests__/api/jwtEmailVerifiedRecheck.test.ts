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
const mockCutOffFor = jest.fn().mockResolvedValue(0);
jest.mock("@/lib/auth/sessionCutOff", () => ({
  __esModule: true,
  sessionsCutOffFor: (...a: unknown[]) => mockCutOffFor(...a),
  signedInBeforeCutOff: jest.requireActual("@/lib/auth/sessionCutOff").signedInBeforeCutOff,
}));
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
    // A confirmed session. An unconfirmed one is checked on every request
    // (see "sessions of an unconfirmed account" below).
    await jwt({
      token: { id: "user-1", role: "job_seeker", sid: "s1", iat: nowSec() - 60, lastDbCheck: nowSec() - 60, isEmailVerified: true },
    });
    expect(mockUserFindById).not.toHaveBeenCalled();
  });
});

describe("sessions opened before an unproven password was removed", () => {
  // lib/auth/unprovenPassword.ts stamps sessionsValidAfter on the account.
  // token.iat cannot decide this: it is rewritten every time the cookie is
  // re-issued, so a session that is in use always looks newer than the removal.
  const removedAt = () => nowSec() - 120;
  const liveToken = (fields: Record<string, unknown>) => ({
    id: "user-1",
    role: "job_seeker",
    sid: "s1",
    iat: nowSec() - 5,
    lastDbCheck: nowSec() - 600,
    ...fields,
  });
  const removed = () => dbUser({ sessionsValidAfter: new Date(removedAt() * 1000) });

  it("ends a session that signed in before it, however fresh its iat", async () => {
    removed();
    expect(await jwt({ token: liveToken({ authAt: removedAt() - 3600 }) })).toBeNull();
  });

  it("ends a session that carries no sign-in time at all", async () => {
    removed();
    expect(await jwt({ token: liveToken({}) })).toBeNull();
  });

  it("keeps the session of the sign-in that removed it", async () => {
    removed();
    expect(await jwt({ token: liveToken({ authAt: removedAt() }) })).toMatchObject({ id: "user-1" });
  });

  it("keeps it when the removal was stored part-way through that second", async () => {
    // The sign-in time is whole seconds, the stored removal is not. Compared
    // to the millisecond, the owner would be signed out after every removal.
    dbUser({ sessionsValidAfter: new Date(removedAt() * 1000 + 900) });
    expect(await jwt({ token: liveToken({ authAt: removedAt() }) })).toMatchObject({ id: "user-1" });
    expect(await jwt({ token: liveToken({ authAt: removedAt() - 1 }) })).toBeNull();
  });

  it("keeps every session on an account where nothing was removed", async () => {
    dbUser({});
    expect(await jwt({ token: liveToken({ authAt: nowSec() - 86400 }) })).toMatchObject({ id: "user-1" });
    expect(await jwt({ token: liveToken({}) })).toMatchObject({ id: "user-1" });
  });

  it("reads the field on the re-check", async () => {
    let projection = "";
    mockUserFindById.mockReturnValue({
      select: (p: string) => {
        projection = p;
        return { lean: () => Promise.resolve({ isActive: true, role: "job_seeker", termsAcceptedVersion: "v1" }) };
      },
    });
    await jwt({ token: liveToken({ authAt: nowSec() - 900 }) });
    expect(projection.split(" ")).toContain("sessionsValidAfter");
  });
});

describe("how soon a session is first re-checked", () => {
  // With no lastDbCheck stored yet the clock used to be token.iat, which every
  // request moves forward: a client that never went quiet for five minutes was
  // never checked against the database at all.
  it("re-checks five minutes after sign-in, even if every request refreshed iat", async () => {
    dbUser({});
    await jwt({ token: { id: "user-1", role: "job_seeker", sid: "s1", iat: nowSec() - 5, authAt: nowSec() - 600 } });
    expect(mockUserFindById).toHaveBeenCalled();
  });

  it("does not check in the first five minutes", async () => {
    await jwt({ token: { id: "user-1", role: "job_seeker", sid: "s1", iat: nowSec() - 5, authAt: nowSec() - 60 } });
    expect(mockUserFindById).not.toHaveBeenCalled();
  });
});

describe("sessions of an unconfirmed account", () => {
  // Such a session may belong to whoever registered someone else's address.
  // When the owner confirms it, that session must end at once: between
  // five-minute checks it could still add a webhook, a push subscription or a
  // calendar link that outlives the clean-up.
  it("are checked against the database on every request", async () => {
    dbUser({ isEmailVerified: false });
    await jwt({
      token: { id: "user-1", role: "job_seeker", sid: "s1", iat: nowSec() - 5, authAt: nowSec() - 30, lastDbCheck: nowSec() - 10, isEmailVerified: false },
    });
    expect(mockUserFindById).toHaveBeenCalledTimes(1);
  });

  it("end on the first request after the owner's clean-up", async () => {
    dbUser({ isEmailVerified: true, sessionsValidAfter: new Date((nowSec() - 2) * 1000) });
    const token = await jwt({
      token: { id: "user-1", role: "job_seeker", sid: "s1", iat: nowSec() - 5, authAt: nowSec() - 60, lastDbCheck: nowSec() - 10, isEmailVerified: false },
    });
    expect(token).toBeNull();
  });
});

describe("a session refresh asked for by the page (update)", () => {
  // The page can ask for a refresh (POST /api/auth/session). It re-reads the
  // verified flag, which flips an ended session's token to "confirmed": the
  // cut-off must be applied there too, or that session lives until the next
  // five-minute check.
  const refresh = (token: Record<string, unknown>) =>
    jwt({ token, trigger: "update", session: { isEmailVerified: true } });

  it("ends a session that signed in before the clean-up", async () => {
    dbUser({ isEmailVerified: true, sessionsValidAfter: new Date((nowSec() - 2) * 1000) });
    const token = await refresh({ id: "user-1", role: "employer", sid: "s1", authAt: nowSec() - 60, isEmailVerified: false });
    expect(token).toBeNull();
  });

  it("keeps the session of the sign-in that did the clean-up", async () => {
    const cutOff = nowSec() - 2;
    dbUser({ isEmailVerified: true, sessionsValidAfter: new Date(cutOff * 1000 + 500) });
    const token = await refresh({ id: "user-1", role: "employer", sid: "s1", authAt: cutOff, isEmailVerified: false });
    expect(token).toMatchObject({ id: "user-1", isEmailVerified: true });
  });
});

describe("after a password change or reset (every request)", () => {
  // lib/auth/sessionCutOff.ts answers from a 30 s cache, so this check runs on
  // every request, not only on the five-minute one: a thief's session in use
  // ends on its next request, not up to five minutes later.
  it("ends a session that signed in before the change, inside the five-minute window", async () => {
    mockCutOffFor.mockResolvedValueOnce((nowSec() - 2) * 1000);
    const token = await jwt({
      token: { id: "user-1", role: "employer", sid: "s1", iat: nowSec() - 1, authAt: nowSec() - 60, lastDbCheck: nowSec() - 10, isEmailVerified: true },
    });
    expect(token).toBeNull();
    expect(mockCutOffFor).toHaveBeenCalledWith("user-1");
    // No full account read: the five-minute check is not due.
    expect(mockUserFindById).not.toHaveBeenCalled();
  });

  it("ends a session that carries no sign-in time (signed in before this check existed)", async () => {
    mockCutOffFor.mockResolvedValueOnce((nowSec() - 2) * 1000);
    const token = await jwt({
      token: { id: "user-1", role: "employer", sid: "s1", iat: nowSec() - 1, lastDbCheck: nowSec() - 10, isEmailVerified: true },
    });
    expect(token).toBeNull();
  });

  it("keeps a session signed in with the new password", async () => {
    mockCutOffFor.mockResolvedValueOnce((nowSec() - 30) * 1000);
    const token = await jwt({
      token: { id: "user-1", role: "employer", sid: "s1", iat: nowSec() - 1, authAt: nowSec() - 20, lastDbCheck: nowSec() - 10, isEmailVerified: true },
    });
    expect(token).toMatchObject({ id: "user-1" });
  });

  it("ends a page-asked refresh (update) of an old session too", async () => {
    mockCutOffFor.mockResolvedValueOnce((nowSec() - 2) * 1000);
    const token = await jwt({
      token: { id: "user-1", role: "employer", sid: "s1", authAt: nowSec() - 60, isEmailVerified: true },
      trigger: "update",
      session: { name: "New name" },
    });
    expect(token).toBeNull();
  });

  it("is not asked on the sign-in itself", async () => {
    mockCutOffFor.mockResolvedValue((nowSec() + 60) * 1000);
    const token = await jwt({
      token: {},
      user: { id: "user-1", role: "employer", isEmailVerified: true },
    });
    mockCutOffFor.mockResolvedValue(0);
    expect(token).toMatchObject({ id: "user-1" });
    expect(mockCutOffFor).not.toHaveBeenCalled();
  });
});

describe("sign-in time in milliseconds", () => {
  it("is stamped on sign-in beside the seconds", async () => {
    const before = Date.now();
    const token = await jwt({ token: {}, user: { id: "user-1", role: "employer", isEmailVerified: true } });
    expect(typeof token?.authAtMs).toBe("number");
    expect(token?.authAtMs as number).toBeGreaterThanOrEqual(before);
    expect(token?.authAt).toBe(Math.floor((token?.authAtMs as number) / 1000));
  });

  it("ends a session from earlier in the same second as the change", async () => {
    const cutOffMs = nowSec() * 1000 + 600;
    mockCutOffFor.mockResolvedValueOnce(cutOffMs);
    const token = await jwt({
      token: { id: "user-1", role: "employer", sid: "s1", authAt: nowSec(), authAtMs: cutOffMs - 300, lastDbCheck: nowSec(), isEmailVerified: true },
    });
    expect(token).toBeNull();
  });

  it("reaches the page as session.user.authAtMs", async () => {
    const out = await session({ session: { user: {} }, token: { id: "user-1", role: "employer", authAt: 5, authAtMs: 5_123 } });
    expect(out.user).toMatchObject({ authAt: 5, authAtMs: 5_123 });
  });
});
