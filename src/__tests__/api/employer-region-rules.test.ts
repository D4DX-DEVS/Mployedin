/**
 * @jest-environment node
 */
/**
 * Region rules around the employer's own edits and super-agent onboarding.
 *
 * - An employer editing its address does NOT move its region (which
 *   super-agents and agents see it); admins are told so they can move it by
 *   hand. The employer cannot set the region fields itself.
 * - A super-agent with a territory must place a new employer in a city inside
 *   it, or the company would vanish from their own list on creation.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) => {
    try {
      return await handler(req, (req as unknown as { __ctx: unknown }).__ctx, {});
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
  },
}));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(), logActivity: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/security/encryption", () => ({ encryptIfPlain: (v: string) => v }));
jest.mock("@/lib/employers/publishGate", () => ({ meetsProfileRequirements: () => false }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true, resetAt: 0 }),
  RATE_LIMIT_CONFIGS: { employers: {} },
}));

const notifyAddressChanged = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyAdminsEmployerAddressChanged: (...a: unknown[]) => notifyAddressChanged(...a),
}));

const getSuperAgentOwnRegion = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentOwnRegion: (...a: unknown[]) => getSuperAgentOwnRegion(...a),
  hasRegionAssigned: (r: { assignedCityIds: unknown[]; assignedStateIds: unknown[] }) =>
    r.assignedCityIds.length + r.assignedStateIds.length > 0,
  getAgentEmployerIds: jest.fn(),
  getSuperAgentBook: jest.fn(),
}));
const territoryHoldsCity = jest.fn();
const resolveEmployerRegion = jest.fn();
jest.mock("@/lib/agents/territoryCoverage", () => ({
  territoryHoldsCity: (...a: unknown[]) => territoryHoldsCity(...a),
  resolveEmployerRegion: (...a: unknown[]) => resolveEmployerRegion(...a),
  employerCoverageFilter: jest.fn(),
  summariseEmployerRegions: jest.fn(),
}));
jest.mock("@/lib/agents/employerAssignment", () => ({ unassignedEmployerFilter: jest.fn(), resolveEmployerAgents: jest.fn() }));

const EMP_ID = "64b0000000000000000000e1";
let employerDoc: Record<string, unknown> = {};
const employerUpdateOne = jest.fn().mockResolvedValue({});
jest.mock("@/models/Employer", () => {
  const model = {
    // `await Employer.findOne(...)` and `Employer.findOne(...).lean()` both occur.
    findOne: jest.fn(() => Object.assign(Promise.resolve(employerDoc), { lean: async () => employerDoc })),
    updateOne: (...a: unknown[]) => employerUpdateOne(...a),
  };
  return { __esModule: true, default: model, Employer: model };
});
const userFindOne = jest.fn();
const userCreate = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => userFindOne(...a), create: (...a: unknown[]) => userCreate(...a) },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/CompanyUser", () => ({ CompanyUser: {}, getDefaultPermissions: jest.fn() }));

import { PATCH as PATCH_ME } from "@/app/api/employers/me/route";
import { POST as POST_EMPLOYER } from "@/app/api/employers/route";

const patchMe = PATCH_ME as unknown as (r: NextRequest) => Promise<Response>;
const postEmployer = POST_EMPLOYER as unknown as (r: NextRequest) => Promise<Response>;

function req(url: string, method: string, body: unknown, ctx: { userId: string; role: string }) {
  const r = new NextRequest(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  (r as unknown as { __ctx: unknown }).__ctx = { ...ctx, locale: "en" };
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  employerDoc = { _id: EMP_ID, companyName: "ABC", address: "Old Street", country: "IN", regionCityId: "tirur" };
});

describe("PATCH /api/employers/me — the address is not the region", () => {
  const me = { userId: "employer-user", role: "employer" };

  it("an address change tells admins and leaves the region alone", async () => {
    const res = await patchMe(req("http://t/api/employers/me", "PATCH", { address: "New Street" }, me));

    expect(res.status).toBe(200);
    const [, update] = employerUpdateOne.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set).toEqual({ address: "New Street" });
    expect(notifyAddressChanged).toHaveBeenCalledWith("ABC", EMP_ID, "Old Street, IN", "New Street, IN");
  });

  it("the employer cannot set its own region", async () => {
    await patchMe(req("http://t/api/employers/me", "PATCH", {
      address: "Old Street",
      regionCityId: "64b0000000000000000000c9",
      regionStateId: "64b0000000000000000000c8",
    }, me));

    const [, update] = employerUpdateOne.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set).not.toHaveProperty("regionCityId");
    expect(update.$set).not.toHaveProperty("regionStateId");
  });

  it("an edit that keeps the address sends no notice", async () => {
    await patchMe(req("http://t/api/employers/me", "PATCH", { address: "Old Street", industry: "tech" }, me));
    expect(notifyAddressChanged).not.toHaveBeenCalled();
  });
});

describe("POST /api/employers — a super-agent places the company in their territory", () => {
  const sa = { userId: "sa-user", role: "super_agent" };
  const CITY = "64b0000000000000000000c1";
  const body = (extra: Record<string, unknown> = {}) => ({
    name: "Company HR",
    email: "hr@company.test",
    password: "Str0ng!Passw0rd#",
    companyName: "Company",
    ...extra,
  });

  beforeEach(() => {
    getSuperAgentOwnRegion.mockResolvedValue({ assignedCityIds: [CITY], assignedStateIds: [] });
  });

  it("refuses a missing city", async () => {
    const res = await postEmployer(req("http://t/api/employers", "POST", body(), sa));
    expect(res.status).toBe(400);
    expect((await res.json()).details).toEqual([expect.objectContaining({ path: "cityId" })]);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("refuses a city outside the territory", async () => {
    territoryHoldsCity.mockResolvedValue(false);
    const res = await postEmployer(req("http://t/api/employers", "POST", body({ cityId: "64b0000000000000000000c2" }), sa));
    expect(res.status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("accepts a city inside it and resolves the region before creating anything", async () => {
    territoryHoldsCity.mockResolvedValue(true);
    resolveEmployerRegion.mockResolvedValue({ cityId: CITY, stateId: "s1", cityName: "Tirur", countryCode: "IN" });
    // Stop at the duplicate-email check: getting there means the region gate passed.
    userFindOne.mockResolvedValue({ _id: "someone" });

    const res = await postEmployer(req("http://t/api/employers", "POST", body({ cityId: CITY }), sa));

    expect(res.status).toBe(409);
    expect(resolveEmployerRegion).toHaveBeenCalledWith({ cityId: CITY });
  });
});
