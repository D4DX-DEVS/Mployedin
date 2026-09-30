/**
 * @jest-environment node
 */
/**
 * An employer's signup city decides who sees the company: every super-agent
 * and agent whose territory covers it. The route must store the region on the
 * Employer (not just a free-text city), tell everyone who covers it, and tell
 * the admins when nobody does — never guess an unrelated super-agent.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true })),
  RATE_LIMIT_CONFIGS: { auth: {} },
}));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "10.0.0.1" }));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: async () => "hashed" } }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/subscription/autoAssign", () => ({ autoAssignDefaultPlan: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  EmailTemplates: { verifyEmailOtp: () => ({}), employerSelfWelcome: () => ({}) },
}));
jest.mock("@/lib/storage/spaces", () => ({ uploadBuffer: jest.fn() }));
jest.mock("@/lib/auth/emailVerification", () => ({ hashOtp: () => "otp" }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/gdpr/consent", () => ({ recordRegistrationConsents: jest.fn().mockResolvedValue(undefined) }));

const userCreate = jest.fn(async () => ({ _id: { toString: () => "user-1" } }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(async () => null),
    create: (...a: unknown[]) => userCreate(...(a as [])),
    deleteOne: jest.fn(),
    findById: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
  },
}));
const employerCreate = jest.fn(async () => ({ _id: "employer-1" }));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    create: (...a: unknown[]) => employerCreate(...(a as [])),
    findOne: jest.fn(() => ({ lean: async () => null })),
    deleteOne: jest.fn(),
  },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findById: jest.fn(), findOne: jest.fn(), findByIdAndUpdate: jest.fn() } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findById: jest.fn(), findOne: jest.fn() } }));
jest.mock("@/models/ReferralLink", () => ({ __esModule: true, default: { findOne: jest.fn(), updateMany: jest.fn() } }));
jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: { create: jest.fn().mockResolvedValue({}), exists: jest.fn(async () => null), deleteMany: jest.fn() },
  getDefaultPermissions: () => ({}),
}));

const notifyRegion = jest.fn().mockResolvedValue(undefined);
const notifyOutside = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyAdminsEmployerRegistered: jest.fn().mockResolvedValue(undefined),
  notifyRegionEmployerRegistered: (...a: unknown[]) => notifyRegion(...a),
  notifyAdminsEmployerOutsideTerritory: (...a: unknown[]) => notifyOutside(...a),
  getSuperAgentUserId: jest.fn(),
  notifySuperAgentEmployerRegistered: jest.fn(),
}));

const DUBAI = { cityId: "city-dubai", stateId: "state-dubai", cityName: "Dubai", countryCode: "AE" };
const resolveEmployerRegion = jest.fn();
const findRegionCoverage = jest.fn();
jest.mock("@/lib/agents/territoryCoverage", () => ({
  resolveEmployerRegion: (...a: unknown[]) => resolveEmployerRegion(...a),
  findRegionCoverage: (...a: unknown[]) => findRegionCoverage(...a),
}));

function register(fields: Record<string, string>) {
  const form = new FormData();
  const base: Record<string, string> = {
    companyName: "ABC Technologies",
    industry: "technology",
    size: "11-50",
    country: "AE",
    city: "Dubai",
    contactName: "Asha",
    contactEmail: "asha@abc.example",
    password: "Str0ng!Passw0rd#",
    termsAccepted: "true",
  };
  for (const [k, v] of Object.entries({ ...base, ...fields })) form.append(k, v);
  return new NextRequest("http://localhost/api/auth/employer-register", { method: "POST", body: form });
}

async function post(fields: Record<string, string>) {
  const { POST } = await import("@/app/api/auth/employer-register/route");
  const res = await POST(register(fields));
  // Let the fire-and-forget region notifications settle.
  await new Promise((r) => setImmediate(r));
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("employer registration — region", () => {
  it("stores the picked city as the employer's region", async () => {
    resolveEmployerRegion.mockResolvedValue(DUBAI);
    findRegionCoverage.mockResolvedValue({ superAgents: [], agents: [] });

    const res = await post({ cityId: "city-dubai" });

    expect(res.status).toBe(201);
    expect(resolveEmployerRegion).toHaveBeenCalledWith({ cityId: "city-dubai", cityName: "Dubai", countryCode: "AE" });
    expect(employerCreate).toHaveBeenCalledWith(expect.objectContaining({
      regionCityId: "city-dubai",
      regionStateId: "state-dubai",
      city: "Dubai",
      country: "AE",
    }));
  });

  it("notifies every super-agent and agent covering the region — overlaps included", async () => {
    resolveEmployerRegion.mockResolvedValue(DUBAI);
    findRegionCoverage.mockResolvedValue({
      superAgents: [
        { userId: "sa-a", profileId: "p1", name: "A", email: "a@x", via: "city" },
        { userId: "sa-b", profileId: "p2", name: "B", email: "b@x", via: "state" },
      ],
      agents: [{ userId: "agent-1", profileId: "p3", name: "Ag", email: "g@x", via: "city" }],
    });

    await post({ cityId: "city-dubai" });

    expect(notifyRegion).toHaveBeenCalledWith("sa-a", "super_agent", "ABC Technologies", "Dubai", "employer-1");
    expect(notifyRegion).toHaveBeenCalledWith("sa-b", "super_agent", "ABC Technologies", "Dubai", "employer-1");
    expect(notifyRegion).toHaveBeenCalledWith("agent-1", "agent", "ABC Technologies", "Dubai", "employer-1");
    expect(notifyOutside).not.toHaveBeenCalled();
  });

  it("tells the admins — and nobody else — when no super-agent covers the region", async () => {
    resolveEmployerRegion.mockResolvedValue({ ...DUBAI, cityId: "city-x", cityName: "Region X" });
    findRegionCoverage.mockResolvedValue({ superAgents: [], agents: [] });

    await post({ cityId: "city-x" });

    expect(employerCreate).toHaveBeenCalledWith(expect.objectContaining({ regionCityId: "city-x" }));
    expect(notifyRegion).not.toHaveBeenCalled();
    expect(notifyOutside).toHaveBeenCalledWith("ABC Technologies", "employer-1", "Region X, AE");
  });

  it("rejects an unknown city id before creating any account", async () => {
    resolveEmployerRegion.mockResolvedValue(null);

    const res = await post({ cityId: "not-a-city" });

    expect(res.status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
    expect(employerCreate).not.toHaveBeenCalled();
  });

  it("still registers an old client that sends only a typed city, with no region when it cannot resolve", async () => {
    resolveEmployerRegion.mockResolvedValue(null);

    const res = await post({ city: "Somewhere" });

    expect(res.status).toBe(201);
    expect(employerCreate).toHaveBeenCalledWith(expect.objectContaining({ regionCityId: null, regionStateId: null, city: "Somewhere" }));
    expect(notifyOutside).toHaveBeenCalledWith("ABC Technologies", "employer-1", null);
  });
});
