/**
 * @jest-environment node
 *
 * The consent_required bounce keeps the referral code. A visitor who came from a
 * shared job page, pressed "Sign in" and then LinkedIn / Apple has no
 * mpl_signup_consent cookie on the first attempt, so config.ts sends them back to
 * /<locale>/login?error=consent_required&provider=... and must carry the code
 * (taken from the post-login-redirect URL Auth.js kept in its callback-url
 * cookie). The login page then asks for the tick and starts the provider again.
 *
 * Same mocks as api/socialSignupConsent.test.ts (next-auth is ESM).
 */

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
process.env.NEXTAUTH_URL = "http://localhost:3000";

const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();
const mockUserExists = jest.fn();
const mockRecordConsents = jest.fn();
const mockVerifyIdToken = jest.fn();
let cookieJar: Record<string, string> = {};
let requestHeaders: Record<string, string> = {};

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
  headers: jest.fn(async () => new Headers(requestHeaders)),
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
import { oauthRedirectUrl } from "@/lib/auth/oauthRedirect";
import { normalizeReferralCode } from "@/lib/referrals/url";

const signInCallback = authConfig.callbacks!.signIn as unknown as (p: { user: { email?: string }; account: { provider: string } | null }) => Promise<boolean | string>;

const EMAIL = "new.person@example.com";
const CODE = "MPL-1A2B3C4D5E6F7A8B";
const ORIGIN = "http://localhost:3888";
const redirect = (provider = "linkedin") => signInCallback({ user: { email: EMAIL }, account: { provider } });

beforeEach(() => {
  jest.clearAllMocks();
  cookieJar = {};
  requestHeaders = { host: "localhost:3888" };
  mockUserExists.mockResolvedValue(null);
});

describe("consent_required bounce carries the referral code", () => {
  it("adds ref when the OAuth start carried one", async () => {
    cookieJar = { "authjs.callback-url": `${ORIGIN}${oauthRedirectUrl("en", null, CODE)}` };
    await expect(redirect()).resolves.toBe(`/en/login?error=consent_required&provider=linkedin&ref=${CODE}`);
    await expect(redirect("apple")).resolves.toBe(`/en/login?error=consent_required&provider=apple&ref=${CODE}`);
  });

  it("keeps the language and the code together", async () => {
    cookieJar = { "authjs.callback-url": `${ORIGIN}${oauthRedirectUrl("ar", "/ar/jobs/abc", CODE)}` };
    await expect(redirect()).resolves.toBe(`/ar/login?error=consent_required&provider=linkedin&ref=${CODE}`);
  });

  it("reads the __Secure- callback-url cookie that Auth.js uses on https", async () => {
    requestHeaders = { host: "mployedin.example" };
    cookieJar = { "__Secure-authjs.callback-url": `https://mployedin.example${oauthRedirectUrl("en", null, CODE)}` };
    await expect(redirect()).resolves.toBe(`/en/login?error=consent_required&provider=linkedin&ref=${CODE}`);
  });

  it("is exactly the old URL when there is no code", async () => {
    cookieJar = { "authjs.callback-url": `${ORIGIN}${oauthRedirectUrl("en", null)}` };
    await expect(redirect()).resolves.toBe("/en/login?error=consent_required&provider=linkedin");
    cookieJar = {};
    await expect(redirect()).resolves.toBe("/en/login?error=consent_required&provider=linkedin");
  });

  it("ignores a code from a callback URL on another site, and a malformed one", async () => {
    cookieJar = { "authjs.callback-url": `https://evil.example${oauthRedirectUrl("en", null, CODE)}` };
    await expect(redirect()).resolves.toBe("/en/login?error=consent_required&provider=linkedin");
    cookieJar = { "authjs.callback-url": `${ORIGIN}/api/auth/post-login-redirect?locale=en&ref=%3Cscript%3E` };
    await expect(redirect()).resolves.toBe("/en/login?error=consent_required&provider=linkedin");
  });

  it("does not ask a returning user, or a new user who already ticked, so no code is needed", async () => {
    cookieJar = { "authjs.callback-url": `${ORIGIN}${oauthRedirectUrl("en", null, CODE)}` };
    mockUserExists.mockResolvedValue({ _id: "user-1" });
    await expect(redirect()).resolves.toBe(true);
    mockUserExists.mockResolvedValue(null);
    cookieJar = { ...cookieJar, [SIGNUP_CONSENT_COOKIE]: encodeSignupConsent("accepted", CODE) };
    await expect(redirect()).resolves.toBe(true);
  });
});

describe("the whole trip of the code, login page to claim", () => {
  it("OAuth start URL -> callback-url cookie -> bounce URL -> consent cookie -> parsed for the claim", async () => {
    // 1. the login page starts LinkedIn with the code from memory
    const start = oauthRedirectUrl("en", null, CODE);
    expect(new URL(start, ORIGIN).searchParams.get("ref")).toBe(CODE);

    // 2. LinkedIn returns; no tick yet; config.ts bounces and keeps the code
    cookieJar = { "authjs.callback-url": `${ORIGIN}${start}` };
    const bounce = (await redirect()) as string;
    expect(bounce).toBe(`/en/login?error=consent_required&provider=linkedin&ref=${CODE}`);

    // 3. the login page reads ref from the bounce, asks for the tick, writes the consent cookie
    const fromBounce = normalizeReferralCode(new URL(bounce, ORIGIN).searchParams.get("ref"));
    expect(fromBounce).toBe(CODE);
    const consent = encodeSignupConsent("accepted", fromBounce);

    // 4. the second attempt is let through, and post-login-redirect can read the code
    cookieJar = { [SIGNUP_CONSENT_COOKIE]: consent };
    await expect(redirect()).resolves.toBe(true);
    expect(parseSignupConsent(consent)).toEqual({ terms: true, cookieChoice: "accepted", ref: CODE });
  });
});
