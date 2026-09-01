/**
 * @jest-environment node
 *
 * Regression cover for S1 (SUPER-AGENT-AUDIT.md): a super-agent could not approve a
 * commission at all, because PATCH /api/commissions/[id] guarded on commissions:update
 * while the matrix grants that role only read/approve/export.
 *
 * Note this file deliberately does NOT mock @/lib/permissions/matrix — the sibling
 * commission-access.test.ts stubs canAccess to always return true, which is precisely
 * what let S1 hide: a route demanding a permission the real matrix never grants still
 * passes when canAccess is stubbed. Running the real canAccess asserts the matrix and
 * the route together.
 */

import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({ connectDB }));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/integrations/webhookDispatcher", () => ({
  dispatchWebhook: jest.fn(),
}));

jest.mock("@/lib/notifications/trigger", () => ({
  notifyCommissionApproved: jest.fn().mockResolvedValue(undefined),
  notifyCommissionPaid: jest.fn().mockResolvedValue(undefined),
}));

const COMMISSION_ID = "507f1f77bcf86cd799439061";

/** A mutable stand-in for the Mongoose document PATCH loads and saves. */
function commissionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: COMMISSION_ID,
    superAgentId: "super_agent_profile_001",
    agentId: "agent_profile_001",
    amount: 500,
    rate: 10,
    currency: "AED",
    status: "pending",
    save: jest.fn().mockResolvedValue(undefined),
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
}

let currentDoc = commissionDoc();

jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => currentDoc),
  },
}));

const superAgentFindOneLean = jest.fn();

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })) })),
    // Chainable: an approved/paid transition resolves the notification recipient via
    // findById(...).select("userId").lean(). Returning undefined throws inside the
    // handler and surfaces as a 500 — a mock gap that reads like a route bug.
    findById: jest.fn(() => ({
      select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ userId: "agent_user_001" }) })),
    })),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: superAgentFindOneLean })) })),
    findById: jest.fn(() => ({
      select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ userId: "super_agent_user_001" }) })),
    })),
  },
}));

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/commissions/${COMMISSION_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/commissions/[id]/route");
  return PATCH(patchRequest(body), { params: Promise.resolve({ id: COMMISSION_ID }) });
}

describe("Super-agent commission approval (S1)", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    currentDoc = commissionDoc();
    superAgentFindOneLean.mockResolvedValue({ _id: "super_agent_profile_001" });
    auth.mockResolvedValue({
      user: { id: "super_agent_user_001", role: "super_agent", locale: "en" },
    });
  });

  it("lets a super-agent approve their team's placement commission", async () => {
    // The agent earns this line; the SA is only the overseer named on it.
    const res = await patch({ status: "approved" });

    expect(res.status).toBe(200);
    expect(currentDoc.save).toHaveBeenCalled();
  });

  it("refuses to let a super-agent approve their OWN override commission", async () => {
    // An override line has no agentId — the super-agent is the beneficiary.
    // Approving it here would bypass the self-approval exclusion applied when
    // an invoice is marked paid, and the next payout batch would pay it out.
    currentDoc = commissionDoc({ agentId: undefined, type: "override" });

    const res = await patch({ status: "approved" });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("your own commission");
    expect(currentDoc.save).not.toHaveBeenCalled();
  });

  it("lets a super-agent dispute their own commission", async () => {
    const res = await patch({ status: "disputed", disputeReason: "Placement fell through" });

    expect(res.status).toBe(200);
  });

  it("refuses to let a super-agent settle a commission as paid", async () => {
    const res = await patch({ status: "paid" });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("does not permit editing or settling");
    expect(currentDoc.save).not.toHaveBeenCalled();
  });

  it("refuses to let a super-agent rewrite the amount", async () => {
    const res = await patch({ amount: 999999 });

    expect(res.status).toBe(403);
    expect(currentDoc.save).not.toHaveBeenCalled();
  });

  it("refuses to let a super-agent rewrite the rate", async () => {
    const res = await patch({ rate: 95 });

    expect(res.status).toBe(403);
    expect(currentDoc.save).not.toHaveBeenCalled();
  });

  it("still blocks a super-agent from another super-agent's commission", async () => {
    currentDoc = commissionDoc({ superAgentId: "super_agent_profile_999" });

    const res = await patch({ status: "approved" });

    expect(res.status).toBe(403);
  });

  it("still lets an admin edit the amount and settle as paid", async () => {
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });

    const edited = await patch({ amount: 750 });
    expect(edited.status).toBe(200);

    currentDoc = commissionDoc({ status: "approved" });
    const settled = await patch({ status: "paid" });
    expect(settled.status).toBe(200);
  });

  it("blocks a role with no commissions permission at all", async () => {
    auth.mockResolvedValue({ user: { id: "employer_001", role: "employer", locale: "en" } });

    const res = await patch({ status: "approved" });

    // Rejected by the route guard itself — dropping it to commissions:read must not
    // have opened the endpoint to roles the matrix gives no commissions access.
    expect(res.status).toBe(403);
  });
});
