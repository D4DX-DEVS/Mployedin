/**
 * @jest-environment node
 */
/**
 * Admin → Settings → Employer onboarding. Public employer sign-up is off by
 * default; live agent / super-agent invite links still work; super agents and
 * agents may add employers while their switch is on; admins always may.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(async () => undefined), connectDB: jest.fn() }));

let mockSettingsDoc: Record<string, unknown> | null = null;
let mockSettingsError = false;
jest.mock("@/models/SystemSettings", () => ({
  __esModule: true,
  default: {
    findOne: () => ({
      select: () => ({
        lean: async () => {
          if (mockSettingsError) throw new Error("db down");
          return mockSettingsDoc;
        },
      }),
    }),
  },
}));

let mockLink: Record<string, unknown> | null = null;
let mockAgentExists = false;
let mockSuperAgentExists = false;
jest.mock("@/models/ReferralLink", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: async () => mockLink }) }) },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { exists: async () => (mockAgentExists ? { _id: "a" } : null) } }));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { exists: async () => (mockSuperAgentExists ? { _id: "s" } : null) },
}));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true })) }));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "10.0.0.1" }));

import {
  getEmployerOnboardingFlags,
  clearEmployerOnboardingCache,
  canRoleCreateEmployers,
} from "@/lib/settings/employerOnboarding";
import { checkEmployerSignup, employerInviteStatus } from "@/lib/settings/employerSignupGate";
import { GET as publicGET } from "@/app/api/public/employer-onboarding/route";

beforeEach(() => {
  mockSettingsDoc = null;
  mockSettingsError = false;
  mockLink = null;
  mockAgentExists = false;
  mockSuperAgentExists = false;
  clearEmployerOnboardingCache();
});

describe("employer onboarding flags", () => {
  it("defaults to public sign-up off and the hierarchy on", async () => {
    expect(await getEmployerOnboardingFlags()).toEqual({
      employerSelfRegistrationEnabled: false,
      employerInviteLinksEnabled: true,
      superAgentCanCreateEmployers: true,
      agentCanCreateEmployers: true,
    });
  });

  it("reads what the admin saved", async () => {
    mockSettingsDoc = { employerSelfRegistrationEnabled: true, agentCanCreateEmployers: false };
    const flags = await getEmployerOnboardingFlags();
    expect(flags.employerSelfRegistrationEnabled).toBe(true);
    expect(flags.agentCanCreateEmployers).toBe(false);
    expect(flags.superAgentCanCreateEmployers).toBe(true);
  });

  it("keeps public sign-up closed when the settings can't be read", async () => {
    mockSettingsError = true;
    const flags = await getEmployerOnboardingFlags();
    expect(flags.employerSelfRegistrationEnabled).toBe(false);
    expect(flags.employerInviteLinksEnabled).toBe(true);
  });

  it("serves the cached answer until the cache is cleared on save", async () => {
    await getEmployerOnboardingFlags();
    mockSettingsDoc = { employerSelfRegistrationEnabled: true };
    expect((await getEmployerOnboardingFlags()).employerSelfRegistrationEnabled).toBe(false);
    clearEmployerOnboardingCache();
    expect((await getEmployerOnboardingFlags()).employerSelfRegistrationEnabled).toBe(true);
  });

  it("gates super agents and agents by their own switch, never admins", async () => {
    mockSettingsDoc = { superAgentCanCreateEmployers: false, agentCanCreateEmployers: false };
    expect(await canRoleCreateEmployers("super_agent")).toBe(false);
    expect(await canRoleCreateEmployers("agent")).toBe(false);
    expect(await canRoleCreateEmployers("admin")).toBe(true);
  });
});

describe("public employer sign-up gate", () => {
  it("refuses a sign-up without an invite while public sign-up is off", async () => {
    expect(await checkEmployerSignup("")).toEqual({ allowed: false, code: "EMPLOYER_SIGNUP_CLOSED" });
  });

  it("allows a sign-up without an invite once the admin opens it", async () => {
    mockSettingsDoc = { employerSelfRegistrationEnabled: true };
    expect(await checkEmployerSignup(undefined)).toEqual({ allowed: true });
  });

  it("allows a live employer invite link while public sign-up is off", async () => {
    mockLink = { maxUses: 5, usedCount: 1 };
    expect(await checkEmployerSignup("MPL-ABC")).toEqual({ allowed: true });
  });

  it("allows an agent's or super agent's personal referral code", async () => {
    mockAgentExists = true;
    expect(await checkEmployerSignup("AGT-1")).toEqual({ allowed: true });
    mockAgentExists = false;
    mockSuperAgentExists = true;
    expect(await checkEmployerSignup("SA-1")).toEqual({ allowed: true });
  });

  it("refuses a used-up, expired or unknown invite", async () => {
    mockLink = { maxUses: 2, usedCount: 2 };
    expect(await checkEmployerSignup("MPL-ABC")).toEqual({ allowed: false, code: "EMPLOYER_INVITE_INVALID" });
    mockLink = { expiresAt: new Date(Date.now() - 1000), maxUses: 0, usedCount: 0 };
    expect(await checkEmployerSignup("MPL-ABC")).toEqual({ allowed: false, code: "EMPLOYER_INVITE_INVALID" });
    mockLink = null;
    expect(await checkEmployerSignup("NOPE")).toEqual({ allowed: false, code: "EMPLOYER_INVITE_INVALID" });
  });

  it("refuses even a live invite while the admin has invite links paused", async () => {
    mockSettingsDoc = { employerInviteLinksEnabled: false };
    mockLink = { maxUses: 0, usedCount: 0 };
    expect(await employerInviteStatus("MPL-ABC")).toBe("paused");
    expect(await checkEmployerSignup("MPL-ABC")).toEqual({ allowed: false, code: "EMPLOYER_INVITES_PAUSED" });
  });

  it("lets a bad code through as a plain sign-up while public sign-up is open", async () => {
    mockSettingsDoc = { employerSelfRegistrationEnabled: true };
    expect(await checkEmployerSignup("NOPE")).toEqual({ allowed: true });
  });
});

describe("GET /api/public/employer-onboarding", () => {
  it("returns the switches without needing a login", async () => {
    const res = await publicGET(new NextRequest("http://localhost/api/public/employer-onboarding"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      employerSelfRegistrationEnabled: false,
      employerInviteLinksEnabled: true,
      superAgentCanCreateEmployers: true,
      agentCanCreateEmployers: true,
      invite: null,
    });
    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
  });

  it("says whether an invite code is usable, uncached", async () => {
    mockLink = { maxUses: 0, usedCount: 0 };
    const res = await publicGET(new NextRequest("http://localhost/api/public/employer-onboarding?ref=MPL-ABC"));
    expect((await res.json()).invite).toBe("valid");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
