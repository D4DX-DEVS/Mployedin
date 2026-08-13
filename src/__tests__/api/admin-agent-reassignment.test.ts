/**
 * @jest-environment node
 *
 * Regression cover for S2 (SUPER-AGENT-AUDIT.md).
 *
 * Team membership lives in two places — Agent.superAgentId and SuperAgent.agentIds[] —
 * and only the creation paths kept the array in step. Reassigning an agent through
 * PATCH /api/admin/agents wrote superAgentId alone, so the previous super-agent kept
 * the agent in agentIds forever (no $pull existed anywhere in the codebase) and
 * retained team-level access to their data, while the new super-agent never gained
 * them in teamAgentIds.
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/permissions/matrix", () => ({
  canAccess: jest.fn().mockReturnValue(true),
}));

jest.mock("@/models/City", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/State", () => ({ __esModule: true, default: {} }));

jest.mock("@/lib/auth/agentRestrictions", () => ({
  isRegionSubset: jest.fn().mockResolvedValue({ valid: true, invalidCityIds: [], invalidStateIds: [] }),
}));

const agentFindOneLean = jest.fn();
const agentFindOneAndUpdate = jest.fn().mockResolvedValue({});
const superAgentFindByIdAndUpdate = jest.fn().mockResolvedValue({});
const superAgentFindByIdLean = jest.fn().mockResolvedValue(null);

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: agentFindOneLean })) })),
    findOneAndUpdate: (...args: unknown[]) => agentFindOneAndUpdate(...args),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: jest.fn(() => ({ lean: superAgentFindByIdLean })) })),
    findByIdAndUpdate: (...args: unknown[]) => superAgentFindByIdAndUpdate(...args),
  },
}));

// Real 24-char ObjectIds — agentUpdateSchema validates the format.
const AGENT_USER_ID = "507f1f77bcf86cd799430001";
const AGENT_PROFILE_ID = "507f1f77bcf86cd799430002";
const OLD_SA_ID = "507f1f77bcf86cd799430003";
const NEW_SA_ID = "507f1f77bcf86cd799430004";

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/admin/agents/route");
  const req = new NextRequest("http://localhost:3000/api/admin/agents", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({}) });
}

/** The (id, update) pairs passed to SuperAgent.findByIdAndUpdate, for assertions. */
function membershipCalls() {
  return superAgentFindByIdAndUpdate.mock.calls.map(([id, update]) => ({
    id: String(id),
    pull: (update as { $pull?: { agentIds?: unknown } })?.$pull?.agentIds,
    add: (update as { $addToSet?: { agentIds?: unknown } })?.$addToSet?.agentIds,
  }));
}

describe("Admin agent reassignment keeps SuperAgent.agentIds in step (S2)", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    superAgentFindByIdAndUpdate.mockResolvedValue({});
    agentFindOneAndUpdate.mockResolvedValue({});
    superAgentFindByIdLean.mockResolvedValue(null);
    agentFindOneLean.mockResolvedValue({ _id: AGENT_PROFILE_ID, superAgentId: OLD_SA_ID });
    auth.mockResolvedValue({ user: { id: "admin_user_001", role: "admin", locale: "en" } });
  });

  it("pulls the agent from the previous super-agent and adds it to the new one", async () => {
    const res = await patch({ userId: AGENT_USER_ID, superAgentId: NEW_SA_ID });
    expect(res.status).toBe(200);

    const calls = membershipCalls();
    expect(calls).toEqual(
      expect.arrayContaining([
        { id: OLD_SA_ID, pull: AGENT_PROFILE_ID, add: undefined },
        { id: NEW_SA_ID, pull: undefined, add: AGENT_PROFILE_ID },
      ])
    );
  });

  it("pulls from the previous super-agent when the assignment is cleared", async () => {
    const res = await patch({ userId: AGENT_USER_ID, superAgentId: null });
    expect(res.status).toBe(200);

    const calls = membershipCalls();
    expect(calls).toEqual([{ id: OLD_SA_ID, pull: AGENT_PROFILE_ID, add: undefined }]);
  });

  it("adds to the new super-agent when the agent previously had none", async () => {
    agentFindOneLean.mockResolvedValue({ _id: AGENT_PROFILE_ID, superAgentId: null });

    const res = await patch({ userId: AGENT_USER_ID, superAgentId: NEW_SA_ID });
    expect(res.status).toBe(200);

    expect(membershipCalls()).toEqual([{ id: NEW_SA_ID, pull: undefined, add: AGENT_PROFILE_ID }]);
  });

  it("touches no membership array when the super-agent is unchanged", async () => {
    const res = await patch({ userId: AGENT_USER_ID, superAgentId: OLD_SA_ID, commissionRate: 12 });
    expect(res.status).toBe(200);

    expect(superAgentFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("touches no membership array when superAgentId is absent from the body", async () => {
    const res = await patch({ userId: AGENT_USER_ID, commissionRate: 15 });
    expect(res.status).toBe(200);

    expect(superAgentFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("still refuses a non-admin caller", async () => {
    auth.mockResolvedValue({ user: { id: "sa_user_001", role: "super_agent", locale: "en" } });

    const res = await patch({ userId: AGENT_USER_ID, superAgentId: NEW_SA_ID });

    expect(res.status).toBe(403);
    expect(superAgentFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});
