/**
 * @jest-environment node
 *
 * Security regression: NextAuth's update() is a client-controlled POST to
 * /api/auth/session. Its payload MUST NOT be trusted for authorization fields.
 * These tests pin the fix: on trigger="update", `role` / `isEmailVerified` /
 * `isOnboarded` are re-read from the DB and the client payload is ignored.
 */

process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
process.env.NEXTAUTH_URL = "http://localhost:3000";

const mockUserFindById = jest.fn();
const mockJobSeekerFindOne = jest.fn();

// next-auth is ESM (jest can't parse it). Mock it + its providers so only our
// own authConfig object — with the real callbacks under test — is loaded.
jest.mock("next-auth", () => ({
  __esModule: true,
  default: () => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }),
  CredentialsSignin: class CredentialsSignin extends Error { code = "credentials"; },
}));
jest.mock("next-auth/providers/credentials", () => ({ __esModule: true, default: () => ({ id: "credentials" }) }));
jest.mock("next-auth/providers/linkedin", () => ({ __esModule: true, default: () => ({ id: "linkedin" }) }));
jest.mock("next-auth/providers/apple", () => ({ __esModule: true, default: () => ({ id: "apple" }) }));

// DB + side-effect deps mocked so importing authConfig doesn't hit Mongo/network.
jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  User: { findById: (...a: unknown[]) => mockUserFindById(...a), findOne: jest.fn(), create: jest.fn() },
  default: { findById: (...a: unknown[]) => mockUserFindById(...a) },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => mockJobSeekerFindOne(...a), create: jest.fn() },
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

import { authConfig } from "@/lib/auth/config";

type JwtFn = (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
const jwt = authConfig.callbacks!.jwt as unknown as JwtFn;

// Chainable mongoose-ish query stub: findById(...).select(...).lean() -> value
const leanTo = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

beforeEach(() => {
  mockUserFindById.mockReset();
  mockJobSeekerFindOne.mockReset();
});

describe("jwt update() cannot forge authorization fields", () => {
  test("client role='admin' is overwritten by DB role", async () => {
    mockUserFindById.mockReturnValue(leanTo({ role: "job_seeker", isEmailVerified: true }));
    const token = { id: "u1", role: "job_seeker", isEmailVerified: false };

    const out = await jwt({
      token: { ...token },
      trigger: "update",
      session: { role: "admin", isEmailVerified: true },
    });

    expect(out.role).toBe("job_seeker"); // NOT admin
  });

  test("client isEmailVerified=true is ignored when DB says false", async () => {
    mockUserFindById.mockReturnValue(leanTo({ role: "job_seeker", isEmailVerified: false }));

    const out = await jwt({
      token: { id: "u2", role: "job_seeker", isEmailVerified: false },
      trigger: "update",
      session: { isEmailVerified: true },
    });

    expect(out.isEmailVerified).toBe(false);
  });

  test("legitimate verify — DB flipped to true — is reflected in token", async () => {
    mockUserFindById.mockReturnValue(leanTo({ role: "job_seeker", isEmailVerified: true }));

    const out = await jwt({
      token: { id: "u3", role: "job_seeker", isEmailVerified: false },
      trigger: "update",
      session: { isEmailVerified: true },
    });

    expect(out.isEmailVerified).toBe(true);
  });

  test("isOnboarded is re-read from JobSeeker, not the payload", async () => {
    mockUserFindById.mockReturnValue(leanTo({ role: "job_seeker", isEmailVerified: true }));
    mockJobSeekerFindOne.mockReturnValue(leanTo({ isOnboarded: false }));

    const out = await jwt({
      token: { id: "u4", role: "job_seeker", isEmailVerified: true, isOnboarded: false },
      trigger: "update",
      session: { isOnboarded: true },
    });

    expect(out.isOnboarded).toBe(false); // DB wins
  });

  test("cosmetic fields (name/image/locale) stay client-supplied without a DB hit", async () => {
    const out = await jwt({
      token: { id: "u5", role: "job_seeker", isEmailVerified: true },
      trigger: "update",
      session: { name: "New Name", image: "https://cdn/x.png", locale: "ar" },
    });

    expect(out.name).toBe("New Name");
    expect(out.picture).toBe("https://cdn/x.png");
    expect(out.locale).toBe("ar");
    expect(mockUserFindById).not.toHaveBeenCalled(); // no auth field → no DB read
  });
});

describe("periodic DB re-check propagates admin role/permission changes", () => {
  test("stale token role is refreshed from DB on the updateAge check", async () => {
    // Admin flipped job_seeker → employer in the DB; token still carries the
    // login-time role. The 5-min periodic check must pick up the new role.
    mockUserFindById.mockReturnValue(
      leanTo({ isActive: true, role: "employer", permissionMode: "role_default" })
    );
    const staleIat = Math.floor(Date.now() / 1000) - 10 * 60; // past updateAge window

    const out = await jwt({
      token: { id: "u6", role: "job_seeker", iat: staleIat },
    });

    expect(out.role).toBe("employer");
    expect(out.permissionMode).toBe("role_default");
  });

  test("deactivated user still gets session killed (regression guard)", async () => {
    mockUserFindById.mockReturnValue(leanTo({ isActive: false, role: "employer" }));
    const staleIat = Math.floor(Date.now() / 1000) - 10 * 60;

    const out = await jwt({ token: { id: "u7", role: "employer", iat: staleIat } });

    expect(out).toBeNull();
  });
});
