/**
 * @jest-environment node
 *
 * Social sign-up consent (lib/auth/signupConsent.ts): a Google, LinkedIn or
 * Apple sign-in never creates an account until the Terms & Privacy box was
 * ticked, and the tick is written to the consent log when the account is made.
 * Returning users are not asked again.
 *
 * next-auth is ESM and pulls in a large graph, so config.ts's imports are
 * mocked (same approach as emailOtpProvider.test.ts).
 */

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
process.env.NEXTAUTH_URL = "http://localhost:3000";

const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();
const mockUserExists = jest.fn();
const mockRecordConsents = jest.fn();
const mockVerifyIdToken = jest.fn();
let cookieJar: Record<string, string> = {};

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
jest.mock("next/headers", () => ({
  __esModule: true,
  cookies: jest.fn(async () => ({ get: (name: string) => (name in cookieJar ? { name, value: cookieJar[name] } : undefined) })),
}));

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/models/User", () => {
  const model = {
    findOne: (...a: unknown[]) => mockUserFindOne(...a),
    create: (...a: unknown[]) => mockUserCreate(...a),
    exists: (...a: unknown[]) => mockUserExists(...a),
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  return { __esModule: true, User: model, default: model };
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue({}),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ isOnboarded: true }) }) })),
  },
}));
jest.mock("@/models/PendingSignin", () => ({ __esModule: true, default: {}, PENDING_SIGNIN_MAX_ATTEMPTS: 5 }));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn(), findById: jest.fn() } }));
jest.mock("@/models/CompanyUser", () => ({ __esModule: true, CompanyUser: {}, getDefaultPermissions: jest.fn(), computeEffectivePermissions: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ __esModule: true, logActivity: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({
  __esModule: true,
  sendEmail: jest.fn().mockResolvedValue(undefined),
  EmailTemplates: { jobSeekerWelcome: () => ({ subject: "", html: "" }) },
}));
jest.mock("@/lib/firebase/admin", () => ({
  __esModule: true,
  getFirebaseAdminAuth: () => ({ verifyIdToken: (...a: unknown[]) => mockVerifyIdToken(...a) }),
}));
jest.mock("@/lib/storage/rehost-avatar", () => ({ __esModule: true, rehostExternalAvatar: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/auth/linkedin-profile", () => ({ __esModule: true, fetchLinkedInExtras: jest.fn() }));
jest.mock("@/lib/security/encryption", () => ({ __esModule: true, encrypt: jest.fn(), decrypt: jest.fn() }));
jest.mock("@/lib/security/totp", () => ({ __esModule: true, verifyTotp: jest.fn(), hashRecoveryCode: jest.fn() }));
jest.mock("@/lib/security/rateLimit", () => ({ __esModule: true, checkRateLimit: jest.fn() }));
jest.mock("@/lib/referrals/attachJobSeeker", () => ({ __esModule: true, attachJobSeekerReferral: jest.fn() }));
jest.mock("@/lib/subscription/autoAssign", () => ({ __esModule: true, autoAssignDefaultPlan: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/gdpr/consent", () => ({ __esModule: true, recordRegistrationConsents: (...a: unknown[]) => mockRecordConsents(...a) }));

import { authConfig } from "@/lib/auth/config";
import { SIGNUP_CONSENT_COOKIE, encodeSignupConsent, parseSignupConsent } from "@/lib/auth/signupConsent";

type AuthorizeFn = (credentials: Record<string, unknown>, request?: Request) => Promise<Record<string, unknown> | null>;
const firebase = authConfig.providers.find((p) => (p as unknown as { id?: string }).id === "firebase") as unknown as { authorize: AuthorizeFn };
const signInCallback = authConfig.callbacks!.signIn as unknown as (p: { user: { email?: string }; account: { provider: string } | null }) => Promise<boolean | string>;

const EMAIL = "new.person@example.com";
const request = new Request("http://localhost/api/auth/callback/firebase", { headers: { "x-forwarded-for": "10.0.0.7" } });

function user(overrides: Record<string, unknown> = {}) {
  return { _id: "user-1", email: EMAIL, name: "New Person", avatar: null, role: "job_seeker", locale: "en", isActive: true, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  cookieJar = {};
  mockVerifyIdToken.mockResolvedValue({ email: EMAIL, email_verified: true, name: "New Person" });
  mockUserFindOne.mockResolvedValue(null);
  mockUserCreate.mockResolvedValue(user());
  mockRecordConsents.mockResolvedValue(undefined);
});

describe("Google (Firebase) sign-up", () => {
  it("refuses to create an account without the Terms & Privacy tick", async () => {
    await expect(firebase.authorize({ idToken: "tok" }, request)).rejects.toMatchObject({ code: "consent_required" });
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockRecordConsents).not.toHaveBeenCalled();
  });

  it("creates the account once ticked and logs the consent with the cookie answer", async () => {
    const result = await firebase.authorize({ idToken: "tok", termsAccepted: "true", cookieChoice: "accepted" }, request);

    expect(result).toMatchObject({ id: "user-1", email: EMAIL });
    expect(mockUserCreate).toHaveBeenCalledTimes(1);
    expect(mockRecordConsents).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      termsAccepted: true,
      cookieChoice: "accepted",
      source: "registration:google",
    }));
  });

  it("signs a returning user in without asking", async () => {
    mockUserFindOne.mockResolvedValue(user());

    await expect(firebase.authorize({ idToken: "tok" }, request)).resolves.toMatchObject({ id: "user-1" });
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockRecordConsents).not.toHaveBeenCalled();
  });
});

describe("Google (Firebase) sign-in marks the e-mail verified", () => {
  // Staff-created agents/employers start unverified. Google proves the address,
  // as LinkedIn/Apple already count it, so a Google sign-in must not bounce
  // them to /verify-email for a code (client report "agent google signin wont work").
  const findByIdAndUpdate = () => (jest.requireMock("@/models/User") as { default: { findByIdAndUpdate: jest.Mock } }).default.findByIdAndUpdate;

  it("verifies an unverified returning account when Google says the e-mail is verified", async () => {
    mockUserFindOne.mockResolvedValue(user({ role: "agent", isEmailVerified: false }));

    await firebase.authorize({ idToken: "tok" }, request);

    expect(findByIdAndUpdate()).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        isEmailVerified: true,
        emailVerificationToken: undefined,
        emailVerificationOtp: undefined,
        emailVerificationExpiry: undefined,
      }),
    );
  });

  it("leaves the account unverified when Google has not verified the e-mail", async () => {
    mockVerifyIdToken.mockResolvedValue({ email: EMAIL, email_verified: false, name: "New Person" });
    mockUserFindOne.mockResolvedValue(user({ role: "agent", isEmailVerified: false }));

    await firebase.authorize({ idToken: "tok" }, request);

    const writes = findByIdAndUpdate().mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(writes.some((w) => "isEmailVerified" in w)).toBe(false);
  });

  it("does not rewrite an account that is already verified", async () => {
    mockUserFindOne.mockResolvedValue(user({ role: "agent", isEmailVerified: true }));

    await firebase.authorize({ idToken: "tok" }, request);

    const writes = findByIdAndUpdate().mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(writes.some((w) => "isEmailVerified" in w)).toBe(false);
  });

  it("still refuses an inactive account", async () => {
    mockUserFindOne.mockResolvedValue(user({ role: "agent", isEmailVerified: false, isActive: false }));

    await expect(firebase.authorize({ idToken: "tok" }, request)).rejects.toMatchObject({ code: "account_inactive" });
  });
});

describe("LinkedIn / Apple sign-up gate (signIn callback)", () => {
  it("sends a new user without the consent cookie back to the login page", async () => {
    mockUserExists.mockResolvedValue(null);
    cookieJar = { NEXT_LOCALE: "ar" };

    await expect(signInCallback({ user: { email: EMAIL }, account: { provider: "linkedin" } }))
      .resolves.toBe("/ar/login?error=consent_required&provider=linkedin");
  });

  it("lets a new user through once the consent cookie is set", async () => {
    mockUserExists.mockResolvedValue(null);
    cookieJar = { [SIGNUP_CONSENT_COOKIE]: encodeSignupConsent("declined") };

    await expect(signInCallback({ user: { email: EMAIL }, account: { provider: "apple" } })).resolves.toBe(true);
  });

  it("never asks a returning user", async () => {
    mockUserExists.mockResolvedValue({ _id: "user-1" });

    await expect(signInCallback({ user: { email: EMAIL }, account: { provider: "linkedin" } })).resolves.toBe(true);
  });

  it("leaves credentials providers to their own authorize() gate", async () => {
    await expect(signInCallback({ user: { email: EMAIL }, account: { provider: "firebase" } })).resolves.toBe(true);
    expect(mockUserExists).not.toHaveBeenCalled();
  });

  it("refuses a LinkedIn / Apple sign-in that carries no e-mail (it can't be checked)", async () => {
    await expect(signInCallback({ user: {}, account: { provider: "apple" } })).resolves.toBe(false);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });
});

describe("LinkedIn / Apple account lookup (jwt callback)", () => {
  type JwtFn = (p: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  const jwt = authConfig.callbacks!.jwt as unknown as JwtFn;
  const signInWith = (email: string | undefined, provider = "linkedin") =>
    jwt({
      token: { email, name: "New Person" },
      user: { id: "provider-sub", email },
      account: { provider, providerAccountId: "sub-1", type: "oidc" },
    });

  it("finds a returning user whatever casing the provider sends", async () => {
    mockUserFindOne.mockResolvedValue(user({ linkedinSub: "sub-1", isEmailVerified: true }));

    const token = await signInWith("New.Person@Example.COM");

    expect(mockUserFindOne).toHaveBeenCalledWith({ email: EMAIL });
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(token).toMatchObject({ id: "user-1" });
  });

  it("creates a new account with the lower-cased e-mail and logs the consent from the cookie", async () => {
    cookieJar = { [SIGNUP_CONSENT_COOKIE]: encodeSignupConsent("accepted") };

    await signInWith("New.Person@Example.COM");

    expect(mockUserCreate).toHaveBeenCalledWith(expect.objectContaining({ email: EMAIL }));
    expect(mockRecordConsents).toHaveBeenCalledWith(expect.objectContaining({
      termsAccepted: true,
      cookieChoice: "accepted",
      source: "registration:linkedin",
    }));
  });

  it("never looks an account up by a missing e-mail", async () => {
    await expect(signInWith(undefined, "apple")).resolves.toBeNull();
    expect(mockUserFindOne).not.toHaveBeenCalled();
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("a duplicate-key race signs into the account that won", async () => {
    mockUserFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(user({ _id: "winner" }));
    mockUserCreate.mockRejectedValueOnce(Object.assign(new Error("E11000"), { code: 11000 }));

    const token = await signInWith(EMAIL);

    expect(token).toMatchObject({ id: "winner" });
    expect(mockRecordConsents).not.toHaveBeenCalled();
  });
});

describe("consent cookie value", () => {
  it("round-trips the tick and the cookie-banner answer", () => {
    expect(parseSignupConsent(encodeSignupConsent("accepted"))).toEqual({ terms: true, cookieChoice: "accepted" });
    expect(parseSignupConsent(encodeSignupConsent(null))).toEqual({ terms: true, cookieChoice: null });
  });

  it("treats anything else as no consent", () => {
    expect(parseSignupConsent(undefined).terms).toBe(false);
    expect(parseSignupConsent("yes").terms).toBe(false);
  });
});
