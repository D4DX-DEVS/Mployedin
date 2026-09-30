/**
 * @jest-environment node
 *
 * A staff account with custom (restricted) permissions must be restricted from
 * its very first request. The sign-in authorize() results used to omit
 * permissionMode/customPermissions, so the fresh token fell back to
 * role_default — full role rights in the UI and in withAuth — until the
 * 5-minute DB re-check in the jwt callback caught up.
 */

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
process.env.NEXTAUTH_URL = "http://localhost:3000";

const mockUserFindOne = jest.fn();
const mockUserFindByIdAndUpdate = jest.fn();
const mockJobSeekerFindOne = jest.fn();

jest.mock("next-auth", () => ({
  __esModule: true,
  default: () => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }),
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));
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
    create: jest.fn(),
    exists: jest.fn().mockResolvedValue({ _id: "user-1" }),
  };
  return { __esModule: true, User: model, default: model };
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => mockJobSeekerFindOne(...a), updateOne: jest.fn(), create: jest.fn() },
}));
jest.mock("@/models/PendingSignin", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    updateOne: jest.fn(),
    findOneAndDelete: jest.fn(),
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
jest.mock("@/lib/audit/log", () => ({ __esModule: true, logActivity: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ __esModule: true, sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/firebase/admin", () => ({ __esModule: true, getFirebaseAdminAuth: jest.fn() }));
jest.mock("@/lib/storage/rehost-avatar", () => ({ __esModule: true, rehostExternalAvatar: jest.fn() }));
jest.mock("@/lib/auth/linkedin-profile", () => ({ __esModule: true, fetchLinkedInExtras: jest.fn() }));
jest.mock("@/lib/security/encryption", () => ({ __esModule: true, encrypt: jest.fn(), decrypt: jest.fn() }));
jest.mock("@/lib/security/totp", () => ({ __esModule: true, verifyTotp: jest.fn(), hashRecoveryCode: jest.fn() }));
jest.mock("@/lib/security/rateLimit", () => ({
  __esModule: true,
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock("@/lib/employers/company-membership", () => ({ __esModule: true, ensureEmployerOwnerMembership: jest.fn() }));
jest.mock("@/lib/gdpr/consent", () => ({ __esModule: true, recordRegistrationConsents: jest.fn() }));
jest.mock("next/headers", () => ({ __esModule: true, cookies: jest.fn(async () => ({ get: () => undefined })) }));
jest.mock("@/lib/referrals/attachJobSeeker", () => ({ __esModule: true, attachJobSeekerReferral: jest.fn() }));
jest.mock("@/lib/subscription/autoAssign", () => ({ __esModule: true, autoAssignDefaultPlan: jest.fn() }));
jest.mock("@/lib/auth/emailVerification", () => ({
  __esModule: true,
  hashOtp: (otp: string) => `hashed_${otp}`,
  otpHashesMatch: (a: string, b: string) => a === b,
}));

import { authConfig } from "@/lib/auth/config";

type AuthorizeFn = (credentials: Record<string, unknown>, request?: Request) => Promise<Record<string, unknown> | null>;
type JwtFn = (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

const providers = authConfig.providers as unknown as Array<{ authorize?: AuthorizeFn }>;
const passwordAuthorize = providers[0].authorize as AuthorizeFn;
const jwt = authConfig.callbacks!.jwt as unknown as JwtFn;

const CUSTOM = { invoices: ["read"], subscriptions: ["read", "update"] };

function lean<T>(value: T) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function staffUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => "user-1" },
    email: "restricted@example.com",
    name: "Restricted Admin",
    avatar: null,
    role: "admin",
    locale: "en",
    isActive: true,
    isEmailVerified: true,
    passwordHash: "hash",
    twoFactorEnabled: false,
    permissionMode: "custom",
    customPermissions: CUSTOM,
    isLocked: () => false,
    comparePassword: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFindByIdAndUpdate.mockResolvedValue(null);
  mockJobSeekerFindOne.mockReturnValue(lean(null));
});

describe("sign-in carries custom staff permissions into the first token", () => {
  it("password sign-in returns permissionMode and customPermissions", async () => {
    mockUserFindOne.mockReturnValue({ select: () => Promise.resolve(staffUser()) });

    const user = await passwordAuthorize(
      { email: "restricted@example.com", password: "correct-horse-battery" },
      new Request("http://localhost/api/auth/callback/credentials"),
    );

    expect(user).toMatchObject({ role: "admin", permissionMode: "custom", customPermissions: CUSTOM });
  });

  it("the jwt callback puts them on the token at sign-in", async () => {
    const token = await jwt({
      token: {},
      user: { id: "user-1", role: "admin", permissionMode: "custom", customPermissions: CUSTOM },
      trigger: "signIn",
      account: { provider: "credentials" },
    });

    expect(token).toMatchObject({ permissionMode: "custom", customPermissions: CUSTOM });
  });
});
