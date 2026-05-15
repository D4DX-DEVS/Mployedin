/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({
  connectDB,
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/permissions/matrix", () => ({
  canAccess: jest.fn().mockReturnValue(true),
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

const commissionLean = jest.fn();
const commissionQuery = {
  populate: jest.fn(),
  lean: commissionLean,
};
commissionQuery.populate.mockReturnValue(commissionQuery);

const agentFindOneLean = jest.fn();
const superAgentFindOneLean = jest.fn();

jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => commissionQuery),
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: agentFindOneLean })) })),
    findById: jest.fn(),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: superAgentFindOneLean })) })),
    findById: jest.fn(),
  },
}));

const COMMISSION_ID = "507f1f77bcf86cd799439061";

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/commissions/${COMMISSION_ID}`);
}

describe("Commission access control", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    commissionQuery.populate.mockReturnValue(commissionQuery);
    agentFindOneLean.mockResolvedValue({ _id: "agent_profile_001" });
    superAgentFindOneLean.mockResolvedValue({ _id: "super_agent_profile_001" });
  });

  it("allows an agent to read their own commission by Agent profile id", async () => {
    auth.mockResolvedValue({ user: { id: "agent_user_001", role: "agent", locale: "en" } });
    commissionLean.mockResolvedValue({
      _id: COMMISSION_ID,
      agentId: { _id: "agent_profile_001", fullName: "Agent One" },
      amount: 500,
      currency: "AED",
      status: "approved",
    });

    const { GET } = await import("@/app/api/commissions/[id]/route");
    const res = await GET(request(), { params: Promise.resolve({ id: COMMISSION_ID }) });

    expect(res.status).toBe(200);
  });

  it("blocks an agent from reading another agent profile commission", async () => {
    auth.mockResolvedValue({ user: { id: "agent_user_001", role: "agent", locale: "en" } });
    commissionLean.mockResolvedValue({
      _id: COMMISSION_ID,
      agentId: { _id: "agent_profile_999", fullName: "Agent Other" },
      amount: 500,
      currency: "AED",
      status: "approved",
    });

    const { GET } = await import("@/app/api/commissions/[id]/route");
    const res = await GET(request(), { params: Promise.resolve({ id: COMMISSION_ID }) });

    expect(res.status).toBe(403);
  });

  it("allows a super agent to read their own override commission", async () => {
    auth.mockResolvedValue({ user: { id: "super_agent_user_001", role: "super_agent", locale: "en" } });
    commissionLean.mockResolvedValue({
      _id: COMMISSION_ID,
      superAgentId: "super_agent_profile_001",
      amount: 250,
      currency: "AED",
      status: "approved",
    });

    const { GET } = await import("@/app/api/commissions/[id]/route");
    const res = await GET(request(), { params: Promise.resolve({ id: COMMISSION_ID }) });

    expect(res.status).toBe(200);
  });

  it("allows admins to read any commission", async () => {
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    commissionLean.mockResolvedValue({
      _id: COMMISSION_ID,
      agentId: { _id: "agent_profile_999", fullName: "Agent Other" },
      amount: 500,
      currency: "AED",
      status: "approved",
    });

    const { GET } = await import("@/app/api/commissions/[id]/route");
    const res = await GET(request(), { params: Promise.resolve({ id: COMMISSION_ID }) });

    expect(res.status).toBe(200);
    expect(agentFindOneLean).not.toHaveBeenCalled();
  });
});