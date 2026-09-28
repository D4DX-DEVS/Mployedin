/**
 * @jest-environment node
 *
 * Approving or paying a commission notifies the person who EARNS it: the agent
 * for a placement line, the super-agent for an override. A placement line also
 * names the overseeing super-agent (for scoping), but that super-agent must not
 * be told "Your commission … has been approved" for money that is the agent's.
 */

import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/db/mongoose", () => ({ connectDB }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/integrations/webhookDispatcher", () => ({ dispatchWebhook: jest.fn() }));

const notifyCommissionApproved = jest.fn().mockResolvedValue(undefined);
const notifyCommissionPaid = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyCommissionApproved: (...a: unknown[]) => notifyCommissionApproved(...a),
  notifyCommissionPaid: (...a: unknown[]) => notifyCommissionPaid(...a),
}));

const COMMISSION_ID = "507f1f77bcf86cd799439061";

function commissionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: COMMISSION_ID,
    type: "placement",
    agentId: "agent_profile_001",
    superAgentId: "super_agent_profile_001",
    amount: 500,
    currency: "AED",
    status: "pending",
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let currentDoc = commissionDoc();
jest.mock("@/models/Commission", () => ({ __esModule: true, default: { findById: jest.fn(() => currentDoc) } }));

const profileLookup = (userId: string) => jest.fn(() => ({
  select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ userId }) })),
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })) })),
    findById: profileLookup("agent_user_001"),
  },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })) })),
    findById: profileLookup("super_agent_user_001"),
  },
}));

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/commissions/[id]/route");
  const req = new NextRequest(`http://localhost:3000/api/commissions/${COMMISSION_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id: COMMISSION_ID }) });
}

describe("commission notifications go to the earner only", () => {
  const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
  });

  it("approving an agent's placement line notifies the agent, not the overseeing super-agent", async () => {
    currentDoc = commissionDoc();
    expect((await patch({ status: "approved" })).status).toBe(200);
    expect(notifyCommissionApproved).toHaveBeenCalledTimes(1);
    expect(notifyCommissionApproved).toHaveBeenCalledWith("agent_user_001", "agent", 500, "AED");
  });

  it("paying an agent's placement line notifies the agent only", async () => {
    currentDoc = commissionDoc({ status: "approved" });
    expect((await patch({ status: "paid", paymentRef: "TRX-1" })).status).toBe(200);
    expect(notifyCommissionPaid).toHaveBeenCalledTimes(1);
    expect(notifyCommissionPaid).toHaveBeenCalledWith("agent_user_001", "agent", 500, "AED", "TRX-1");
  });

  it("approving and paying an override notifies the super-agent only", async () => {
    currentDoc = commissionDoc({ type: "override", agentId: undefined });
    await patch({ status: "approved" });
    expect(notifyCommissionApproved).toHaveBeenCalledTimes(1);
    expect(notifyCommissionApproved).toHaveBeenCalledWith("super_agent_user_001", "super_agent", 500, "AED");

    currentDoc = commissionDoc({ type: "override", agentId: undefined, status: "approved" });
    await patch({ status: "paid", paymentRef: "TRX-1" });
    expect(notifyCommissionPaid).toHaveBeenCalledTimes(1);
    expect(notifyCommissionPaid).toHaveBeenCalledWith("super_agent_user_001", "super_agent", 500, "AED", "TRX-1");
  });

  it("notifies nobody for a line with no recipient", async () => {
    currentDoc = commissionDoc({ type: "override", agentId: undefined, superAgentId: undefined });
    expect((await patch({ status: "approved" })).status).toBe(200);
    expect(notifyCommissionApproved).not.toHaveBeenCalled();
  });
});
