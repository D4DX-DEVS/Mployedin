/**
 * @jest-environment node
 *
 * An agent who registered themselves waits, inactive, for approval. Anyone
 * can register with someone else's address, so an agent must not be switched
 * on before the address is confirmed. Disabling the button is not enough: the
 * check lives in every API path that can switch an agent on —
 *   PATCH /api/admin/agents          (agent edit form)
 *   PATCH /api/admin/users           (row "Activate", single and bulk)
 *   PATCH /api/super-agent/agents/:id (the super-agent's own team)
 *   PATCH /api/admin/super-agents    (must only ever edit super agents)
 * plus making an active, unconfirmed account an agent (role conversion), an
 * admin replacing an agent's address, and staff-created agents, which are
 * approved by being created (`agentApprovedAt`) and can be switched back on.
 */
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
  default: jest.fn().mockResolvedValue(undefined),
}));

let ctxRole: "admin" | "super_agent" = "admin";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: unknown) => Promise<Response>) =>
    async (req: NextRequest, routeCtx?: { params?: Promise<Record<string, string>> }) => {
      try {
        const params = routeCtx?.params ? await routeCtx.params : undefined;
        return await handler(req, { userId: "507f1f77bcf86cd799439099", role: ctxRole, locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/employers/accountStatus", () => ({
  deactivateEmployerAccount: jest.fn(),
  reactivateEmployerAccount: jest.fn(),
}));
jest.mock("@/lib/notifications/trigger", () => ({ notifyRoleChanged: jest.fn() }));
jest.mock("@/models/City", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/State", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Lead", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/ReferralLink", () => ({ __esModule: true, default: {} }));
jest.mock("@/lib/agentPerformance", () => ({ EMPTY_AGENT_PERFORMANCE: {}, getLiveAgentPerformance: jest.fn() }));
jest.mock("@/lib/agents/assignedRegion", () => ({ regionLocale: jest.fn(), resolveAssignedRegions: jest.fn() }));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: jest.fn(async () => "hash") }, hash: jest.fn(async () => "hash") }));
jest.mock("@/models/TargetProfile", () => ({ __esModule: true, default: {}, PROFIT_TARGET_FILTER: {} }));
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({ enrichProfiles: jest.fn() }));
jest.mock("@/lib/superAgent/regions", () => ({ findRegionOverlaps: jest.fn(async () => []), trimAgentsToRegion: jest.fn() }));

const AGENT_USER_ID = "507f1f77bcf86cd799430001";
const AGENT_DOC_ID = "507f1f77bcf86cd799430002";
const OTHER_ID = "507f1f77bcf86cd799430003";

jest.mock("@/lib/auth/agentRestrictions", () => ({
  isRegionSubset: jest.fn().mockResolvedValue({ valid: true, invalidCityIds: [], invalidStateIds: [] }),
  getSuperAgentOwnRegion: jest.fn().mockResolvedValue({ assignedCityIds: [], assignedStateIds: [] }),
  getSuperAgentScope: jest.fn(async () => ({
    effectiveAgentIds: [{ toString: () => "507f1f77bcf86cd799430002" }],
  })),
}));

/** Accounts by id, as the routes read them. */
let accounts: Record<string, Record<string, unknown>> = {};
const userUpdateOne = jest.fn(async (..._a: unknown[]) => ({ modifiedCount: 1 }));
const userFindOne = jest.fn(async (..._a: unknown[]) => null as unknown);
const userCreate = jest.fn(async (doc: Record<string, unknown>) => ({ _id: "507f1f77bcf86cd799430009", ...doc }));
const userFindByIdAndUpdate = jest.fn((id: unknown, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
  const doc = { _id: id, ...accounts[String(id)], ...(update?.$set ?? {}) };
  const result = Promise.resolve(doc) as Promise<unknown> & { select?: unknown };
  result.select = () => ({ lean: () => Promise.resolve(doc) });
  return result;
});
jest.mock("@/models/User", () => {
  const read = (id: unknown) => ({
    select: () => ({ lean: () => Promise.resolve(accounts[String(id)] ?? null) }),
  });
  const model = {
    findById: (id: unknown) => read(id),
    findByIdAndUpdate: (...a: unknown[]) => userFindByIdAndUpdate(...(a as [unknown, { $set?: Record<string, unknown> }])),
    updateOne: (...a: unknown[]) => userUpdateOne(...a),
    // Thenable and chainable, for `await User.findOne()` and `.select().lean()`.
    findOne: (...a: unknown[]) => {
      const result = userFindOne(...a) as Promise<unknown> & { select?: unknown };
      result.select = () => ({ lean: () => result });
      return result;
    },
    create: (doc: Record<string, unknown>) => userCreate(doc),
    findByIdAndDelete: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };
  return { __esModule: true, default: model };
});

const agentFindByIdAndUpdate = jest.fn(async () => ({}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ userId: "507f1f77bcf86cd799430001" }) }) })),
    findByIdAndUpdate: (...a: unknown[]) => agentFindByIdAndUpdate(...(a as [])),
    findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) })),
    findOneAndUpdate: jest.fn(async () => ({})),
    create: jest.fn(async () => ({ _id: "507f1f77bcf86cd799430008" })),
  },
}));
const superAgentFindOneAndUpdate = jest.fn(async () => ({}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) })),
    findByIdAndUpdate: jest.fn(),
    findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) })),
    findOneAndUpdate: (...a: unknown[]) => superAgentFindOneAndUpdate(...(a as [])),
  },
}));

import { PATCH as adminAgentsPatch, POST as adminAgentsPost } from "@/app/api/admin/agents/route";
import { PATCH as adminUsersPatch } from "@/app/api/admin/users/route";
import { PATCH as superAgentsPatch } from "@/app/api/admin/super-agents/route";
import { PATCH as saAgentPatch } from "@/app/api/super-agent/agents/[id]/route";

function patchReq(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const call = (handler: unknown, url: string, body: unknown, params: Record<string, string> = {}) =>
  (handler as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>)(
    patchReq(url, body),
    { params: Promise.resolve(params) },
  );

const pendingAgent = (fields: Record<string, unknown> = {}) => ({
  role: "agent",
  isActive: false,
  isEmailVerified: false,
  name: "Pending Agent",
  email: "agent@example.org",
  ...fields,
});

/** Whether any write switched the account on. */
function switchedOn(): boolean {
  const viaFindByIdAndUpdate = userFindByIdAndUpdate.mock.calls.some(([, update]) => update?.$set?.isActive === true);
  const viaUpdateOne = userUpdateOne.mock.calls.some(
    (args) => (args[1] as { $set?: Record<string, unknown> })?.$set?.isActive === true,
  );
  return viaFindByIdAndUpdate || viaUpdateOne;
}

beforeEach(() => {
  ctxRole = "admin";
  accounts = {};
  userUpdateOne.mockClear();
  userFindByIdAndUpdate.mockClear();
  agentFindByIdAndUpdate.mockClear();
  superAgentFindOneAndUpdate.mockClear();
  userFindOne.mockReset().mockResolvedValue(null);
  userCreate.mockClear();
});

/** The `$set` / `$unset` of the single write to the account, if any. */
function accountWrite() {
  const call = userFindByIdAndUpdate.mock.calls[0];
  return call ? (call[1] as { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) : undefined;
}

describe("PATCH /api/admin/agents", () => {
  it("refuses to switch on an agent whose email is not confirmed, and writes nothing", async () => {
    accounts[AGENT_USER_ID] = pendingAgent();
    const res = await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, isActive: true, commissionRate: 5 });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "AGENT_EMAIL_NOT_VERIFIED" });
    expect(userFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("switches on an agent whose email is confirmed", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isEmailVerified: true });
    const res = await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, isActive: true });

    expect(res.status).toBe(200);
    expect(switchedOn()).toBe(true);
  });

  it("still saves other changes to an agent that is already active", async () => {
    // An admin-created agent is active from the start; editing it must not be
    // blocked because the form sends isActive: true back.
    accounts[AGENT_USER_ID] = pendingAgent({ isActive: true });
    const res = await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, isActive: true, name: "New Name" });

    expect(res.status).toBe(200);
  });

  it("still lets an unconfirmed agent be switched off", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isActive: true });
    const res = await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, isActive: false });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/admin/users (one account)", () => {
  it("refuses to switch on an unconfirmed agent", async () => {
    accounts[AGENT_USER_ID] = pendingAgent();
    const res = await call(adminUsersPatch, "/api/admin/users", { userId: AGENT_USER_ID, isActive: true });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "AGENT_EMAIL_NOT_VERIFIED" });
    expect(switchedOn()).toBe(false);
  });

  it("refuses to make an inactive unconfirmed account an active agent in one step", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ role: "job_seeker" });
    const res = await call(adminUsersPatch, "/api/admin/users", { userId: AGENT_USER_ID, isActive: true, role: "agent" });

    expect(res.status).toBe(422);
    expect(switchedOn()).toBe(false);
  });

  it("does not hold up other roles", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ role: "employer" });
    const res = await call(adminUsersPatch, "/api/admin/users", { userId: AGENT_USER_ID, isActive: true });

    expect(res.status).toBe(200);
    expect(switchedOn()).toBe(true);
  });

  it("switches on a confirmed agent", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isEmailVerified: true });
    const res = await call(adminUsersPatch, "/api/admin/users", { userId: AGENT_USER_ID, isActive: true });

    expect(res.status).toBe(200);
    expect(switchedOn()).toBe(true);
  });
});

describe("PATCH /api/admin/users (bulk Activate)", () => {
  it("skips unconfirmed agents with their own code and activates the rest", async () => {
    accounts[AGENT_USER_ID] = pendingAgent();
    accounts[OTHER_ID] = pendingAgent({ isEmailVerified: true });

    const res = await call(adminUsersPatch, "/api/admin/users", { ids: [AGENT_USER_ID, OTHER_ID], action: "activate" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: AGENT_USER_ID, status: "skipped", code: "AGENT_EMAIL_NOT_VERIFIED" }),
        expect.objectContaining({ userId: OTHER_ID, status: "updated" }),
      ]),
    );
    const activatedIds = userUpdateOne.mock.calls.map((args) => String((args[0] as { _id: unknown })._id));
    expect(activatedIds).toEqual([OTHER_ID]);
  });
});

describe("PATCH /api/super-agent/agents/:id", () => {
  beforeEach(() => {
    ctxRole = "super_agent";
  });

  it("refuses to switch on an unconfirmed agent, and changes nothing else either", async () => {
    accounts[AGENT_USER_ID] = pendingAgent();
    const res = await call(saAgentPatch, `/api/super-agent/agents/${AGENT_DOC_ID}`, { isActive: true, commissionRate: 7 }, { id: AGENT_DOC_ID });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "AGENT_EMAIL_NOT_VERIFIED" });
    expect(switchedOn()).toBe(false);
    expect(agentFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("switches on a confirmed agent", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isEmailVerified: true });
    const res = await call(saAgentPatch, `/api/super-agent/agents/${AGENT_DOC_ID}`, { isActive: true }, { id: AGENT_DOC_ID });

    expect(res.status).toBe(200);
    expect(switchedOn()).toBe(true);
  });
});

describe("an agent staff approved before", () => {
  // Staff-created agents start active with an address nobody confirmed; the
  // first approval stamps `agentApprovedAt`, so switching them off and on
  // again is not a new approval.
  const approvedBefore = () => pendingAgent({ agentApprovedAt: new Date("2026-11-01T00:00:00Z") });

  it("can be switched back on from the agent form, the users table and the super-agent page", async () => {
    accounts[AGENT_USER_ID] = approvedBefore();
    expect((await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, isActive: true })).status).toBe(200);
    expect((await call(adminUsersPatch, "/api/admin/users", { userId: AGENT_USER_ID, isActive: true })).status).toBe(200);
    ctxRole = "super_agent";
    expect((await call(saAgentPatch, `/api/super-agent/agents/${AGENT_DOC_ID}`, { isActive: true }, { id: AGENT_DOC_ID })).status).toBe(200);
  });

  it("is stamped when first approved, and the stamp is kept afterwards", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isEmailVerified: true });
    await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, isActive: true });
    expect(accountWrite()?.$set?.agentApprovedAt).toBeInstanceOf(Date);

    userFindByIdAndUpdate.mockClear();
    accounts[AGENT_USER_ID] = approvedBefore();
    await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, isActive: true });
    expect(accountWrite()?.$set).not.toHaveProperty("agentApprovedAt");
  });

  it("is stamped by the bulk Activate too", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isEmailVerified: true });
    await call(adminUsersPatch, "/api/admin/users", { ids: [AGENT_USER_ID], action: "activate" });
    const update = userUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set).toMatchObject({ isActive: true, agentApprovedAt: expect.any(Date) });
  });

  it("is what an agent created by an admin starts as", async () => {
    const res = await call(adminAgentsPost, "/api/admin/agents", {
      name: "New Agent",
      email: "new.agent@example.org",
      password: "Str0ng!Passw0rd#",
    });
    expect(res.status).toBe(201);
    expect(userCreate.mock.calls[0][0]).toMatchObject({ role: "agent", isActive: true, agentApprovedAt: expect.any(Date) });
  });
});

describe("making an active, unconfirmed account an agent", () => {
  it("is refused one account at a time", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ role: "job_seeker", isActive: true });
    const res = await call(adminUsersPatch, "/api/admin/users", { userId: AGENT_USER_ID, role: "agent" });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "AGENT_EMAIL_NOT_VERIFIED" });
    expect(userFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("is skipped in a bulk role change, with the code", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ role: "employer", isActive: true });
    const res = await call(adminUsersPatch, "/api/admin/users", { ids: [AGENT_USER_ID], action: "setRole", role: "agent" });
    const body = await res.json();

    expect(body.results).toEqual([expect.objectContaining({ userId: AGENT_USER_ID, status: "skipped", code: "AGENT_EMAIL_NOT_VERIFIED" })]);
    expect(userUpdateOne).not.toHaveBeenCalled();
  });
});

describe("an admin replacing an agent's address", () => {
  it("marks the new address unconfirmed and drops codes and links sent to the old one", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isActive: true, isEmailVerified: true, agentApprovedAt: new Date() });
    const res = await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, email: "replaced@example.org" });

    expect(res.status).toBe(200);
    expect(accountWrite()?.$set).toMatchObject({ email: "replaced@example.org", isEmailVerified: false });
    expect(accountWrite()?.$unset).toMatchObject({ emailVerificationToken: "", emailVerificationOtp: "" });
  });

  it("leaves the confirmation alone when the address does not change", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isActive: true, isEmailVerified: true });
    await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, email: "AGENT@example.org", name: "Same" });
    expect(accountWrite()?.$set).not.toHaveProperty("isEmailVerified");
  });

  it("refuses an address another account uses", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isActive: true, isEmailVerified: true });
    userFindOne.mockResolvedValue({ _id: OTHER_ID });
    const res = await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, email: "taken@example.org" });
    expect(res.status).toBe(409);
    expect(userFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("cannot approve a confirmed pending agent under a new, unproven address", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isEmailVerified: true });
    const res = await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, email: "swap@example.org", isActive: true });
    expect(res.status).toBe(422);
  });

  it("also through the users table", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ isActive: true, isEmailVerified: true, agentApprovedAt: new Date() });
    await call(adminUsersPatch, "/api/admin/users", { userId: AGENT_USER_ID, email: "replaced@example.org" });
    expect(accountWrite()?.$set).toMatchObject({ isEmailVerified: false });
    expect(accountWrite()?.$unset).toMatchObject({ emailVerificationOtp: "" });
  });
});

describe("the agent routes only edit their own kind of account", () => {
  it("PATCH /api/admin/agents refuses an account that is not an agent", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ role: "employer" });
    const res = await call(adminAgentsPatch, "/api/admin/agents", { userId: AGENT_USER_ID, isActive: true });
    expect(res.status).toBe(404);
    expect(userFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("PATCH /api/admin/super-agents refuses an agent (it could switch them on)", async () => {
    accounts[AGENT_USER_ID] = pendingAgent();
    const res = await call(superAgentsPatch, "/api/admin/super-agents", { userId: AGENT_USER_ID, isActive: true });

    expect(res.status).toBe(404);
    expect(switchedOn()).toBe(false);
    expect(superAgentFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("PATCH /api/admin/super-agents still edits a super agent", async () => {
    accounts[AGENT_USER_ID] = pendingAgent({ role: "super_agent" });
    const res = await call(superAgentsPatch, "/api/admin/super-agents", { userId: AGENT_USER_ID, isActive: true });
    expect(res.status).toBe(200);
    expect(switchedOn()).toBe(true);
  });
});
