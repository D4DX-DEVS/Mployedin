/**
 * @jest-environment node
 *
 * Client report 2026-09-30 (#14): "agents are automatically given the super
 * agent's full area". An agent's area is what the admin picks for them; choosing
 * a super agent narrows what can be picked, it no longer fills it in. Agents
 * created before this keep what they have — the admin reviews them.
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));
jest.mock("@/models/City", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/State", () => ({ __esModule: true, default: {} }));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  isRegionSubset: jest.fn().mockResolvedValue({ valid: true, invalidCityIds: [], invalidStateIds: [] }),
}));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: jest.fn().mockResolvedValue("hash") } }));
jest.mock("@/lib/notifications/trigger", () => ({
  notifySuperAgentAgentJoined: jest.fn().mockResolvedValue(undefined),
}));

const AGENT_USER_ID = "507f1f77bcf86cd799430001";
const AGENT_PROFILE_ID = "507f1f77bcf86cd799430002";
const SA_ID = "507f1f77bcf86cd799430004";
const SA_USER_ID = "507f1f77bcf86cd799430005";
const SA_CITY = "507f1f77bcf86cd799430010";
const SA_STATE = "507f1f77bcf86cd799430011";

/** A mongoose-style query: every builder method chains, `lean()` resolves `result`. */
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "sort", "skip", "limit", "populate"]) q[m] = jest.fn(() => q);
  q.lean = jest.fn().mockResolvedValue(result);
  return q;
}

const saWithArea = {
  _id: SA_ID,
  userId: SA_USER_ID,
  defaultAgentCommissionRate: 7,
  assignedCityIds: [SA_CITY],
  assignedStateIds: [SA_STATE],
};

const userFind = jest.fn();
const userFindOne = jest.fn();
const userCreate = jest.fn();
const agentFind = jest.fn();
const agentFindOne = jest.fn();
const agentCreate = jest.fn();
const agentFindOneAndUpdate = jest.fn();
const agentFindByIdAndUpdate = jest.fn();
const saFindById = jest.fn();
const saFind = jest.fn();
const saFindByIdAndUpdate = jest.fn();

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => userFind(...a),
    countDocuments: jest.fn().mockResolvedValue(1),
    findOne: (...a: unknown[]) => userFindOne(...a),
    create: (...a: unknown[]) => userCreate(...a),
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    findByIdAndDelete: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => agentFind(...a),
    findOne: (...a: unknown[]) => agentFindOne(...a),
    create: (...a: unknown[]) => agentCreate(...a),
    findOneAndUpdate: (...a: unknown[]) => agentFindOneAndUpdate(...a),
    findByIdAndUpdate: (...a: unknown[]) => agentFindByIdAndUpdate(...a),
  },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => saFind(...a),
    findById: (...a: unknown[]) => saFindById(...a),
    findByIdAndUpdate: (...a: unknown[]) => saFindByIdAndUpdate(...a),
  },
}));

function request(method: string, body?: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/admin/agents", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  const { auth } = require("@/lib/auth/config");
  auth.mockResolvedValue({ user: { id: "admin_user_001", role: "admin", locale: "en" } });
  saFindById.mockImplementation(() => query(saWithArea));
  saFind.mockImplementation(() => query([saWithArea]));
  saFindByIdAndUpdate.mockResolvedValue({});
  agentFindOneAndUpdate.mockResolvedValue({});
  agentFindByIdAndUpdate.mockResolvedValue({});
});

describe("A new agent starts with no area (client #14)", () => {
  it("creating an agent under a super agent does not copy the super agent's area", async () => {
    userFindOne.mockResolvedValue(null);
    userCreate.mockResolvedValue({ _id: AGENT_USER_ID });
    agentCreate.mockResolvedValue({ _id: AGENT_PROFILE_ID });

    const { POST } = await import("@/app/api/admin/agents/route");
    const res = await POST(
      request("POST", { name: "New Agent", email: "new.agent@example.com", password: "Str0ng!Passw0rd", superAgentId: SA_ID }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const created = agentCreate.mock.calls[0][0];
    expect(created.assignedCityIds).toEqual([]);
    expect(created.assignedStateIds).toEqual([]);
    // The super agent's default commission still applies.
    expect(created.commissionRate).toBe(7);
  });

  it("assigning a super agent to an agent with no area leaves the area empty", async () => {
    agentFindOne.mockImplementation(() => query({ _id: AGENT_PROFILE_ID, superAgentId: null, assignedCityIds: [], assignedStateIds: [] }));

    const { PATCH } = await import("@/app/api/admin/agents/route");
    const res = await PATCH(request("PATCH", { userId: AGENT_USER_ID, superAgentId: SA_ID }), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const set = agentFindOneAndUpdate.mock.calls[0][1].$set;
    expect(set.superAgentId).toBe(SA_ID);
    expect(set).not.toHaveProperty("assignedCityIds");
    expect(set).not.toHaveProperty("assignedStateIds");
  });

  it("listing agents neither writes the super agent's area onto an agent nor shows it as theirs", async () => {
    userFind
      .mockImplementationOnce(() => query([{ _id: AGENT_USER_ID, name: "No Area Agent", role: "agent" }]))
      .mockImplementationOnce(() => query([{ _id: SA_USER_ID, name: "Territory Lead" }]));
    agentFind.mockImplementation(() => query([{
      _id: AGENT_PROFILE_ID,
      userId: AGENT_USER_ID,
      superAgentId: { _id: SA_ID, userId: SA_USER_ID },
      commissionRate: 5,
      assignedCityIds: [],
      assignedStateIds: [],
    }]));

    const { GET } = await import("@/app/api/admin/agents/route");
    const res = await GET(request("GET"), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const { agents } = await res.json();
    expect(agents[0].agentProfile.superAgentName).toBe("Territory Lead");
    expect(agents[0].agentProfile.assignedCityIds).toEqual([]);
    expect(agents[0].agentProfile.assignedStateIds).toEqual([]);
    expect(agentFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});
