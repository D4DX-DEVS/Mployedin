/**
 * @jest-environment node
 *
 * Plan requests replace the "upgrade coming soon" dead end while there is no
 * payment gateway: customers ask, admins decide. These cover who may do what.
 */
import { NextRequest } from "next/server";

const REQ_ID = "651000000000000000000a01";
const CUSTOMER = "651000000000000000000c01";
const PLAN = "651000000000000000000b01";
let mockCtx: { userId: string; role: string; locale: string } = { userId: CUSTOMER, role: "employer", locale: "en" };
let mockEnforced = true;
const mockApply = jest.fn();
const mockNotifyDecided = jest.fn().mockResolvedValue(undefined);
const mockNotifyRequested = jest.fn().mockResolvedValue(undefined);
const mockFindById = jest.fn();
const mockClaim = jest.fn();
const mockCreate = jest.fn();
const mockFindOnePending = jest.fn();

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, params?: Record<string, string>) => handler(req, mockCtx, params),
}));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined), actorFromCtx: () => ({}) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true }), RATE_LIMIT_CONFIGS: { checkout: {} } }));
jest.mock("@/lib/subscription/enforcementFlag", () => ({ isSubscriptionEnforcementEnabled: async () => mockEnforced }));
jest.mock("@/lib/notifications/trigger", () => ({
  notifyUpgradeDecided: (...a: unknown[]) => mockNotifyDecided(...a),
  notifyUpgradeRequested: (...a: unknown[]) => mockNotifyRequested(...a),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/subscription/applyPlan", () => {
  class ApplyPlanError extends Error { constructor(m: string, readonly status: number) { super(m); } }
  return { applyPlanToUser: (...a: unknown[]) => mockApply(...a), ApplyPlanError };
});
const lean = (v: unknown) => ({ lean: async () => v, select: () => ({ lean: async () => v }) });
jest.mock("@/models/UpgradeRequest", () => ({
  __esModule: true,
  default: {
    findById: (...a: unknown[]) => mockFindById(...a),
    findOneAndUpdate: (...a: unknown[]) => mockClaim(...a),
    updateOne: jest.fn().mockResolvedValue({}),
    findOne: (...a: unknown[]) => lean(mockFindOnePending(...a)),
    create: (...a: unknown[]) => mockCreate(...a),
  },
}));
jest.mock("@/models/SubscriptionPlan", () => ({
  __esModule: true,
  default: { findOne: () => lean({ _id: PLAN, name: "Gold", price: 499, currency: "AED", tier: 2 }) },
}));
jest.mock("@/models/Subscription", () => ({
  __esModule: true,
  default: { findOne: () => lean({ planId: "651000000000000000000b00", planSnapshot: { name: "Silver" } }) },
}));
jest.mock("@/models/Employer", () => {
  const m = { findOne: () => lean({ companyName: "Gulf Retail", agentId: "651000000000000000000d01" }), find: () => lean([]) };
  return { __esModule: true, Employer: m, default: m };
});
jest.mock("@/models/User", () => ({ User: { findById: () => lean({ name: "Owner" }) } }));

function pendingDoc() {
  return {
    _id: REQ_ID, userId: CUSTOMER, toPlanId: PLAN, toPlanName: "Gold", targetRole: "employer",
    status: "pending", save: jest.fn().mockResolvedValue(undefined),
  };
}

async function patch(action: string) {
  const { PATCH } = await import("@/app/api/subscriptions/upgrade-requests/[id]/route");
  const req = new NextRequest(`http://localhost/api/subscriptions/upgrade-requests/${REQ_ID}`, {
    method: "PATCH", body: JSON.stringify({ action }), headers: { "content-type": "application/json" },
  });
  return (PATCH as unknown as (r: NextRequest, p: Record<string, string>) => Promise<Response>)(req, { id: REQ_ID });
}

async function post() {
  const { POST } = await import("@/app/api/subscriptions/upgrade-requests/route");
  const req = new NextRequest("http://localhost/api/subscriptions/upgrade-requests", {
    method: "POST", body: JSON.stringify({ planId: PLAN }), headers: { "content-type": "application/json" },
  });
  return (POST as unknown as (r: NextRequest) => Promise<Response>)(req);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnforced = true;
  mockCtx = { userId: CUSTOMER, role: "employer", locale: "en" };
  mockFindById.mockResolvedValue(pendingDoc());
  mockClaim.mockResolvedValue({ ...pendingDoc(), status: "approved" });
  mockApply.mockResolvedValue({ subscriptionId: "s1", action: "upgraded", invoiceId: "i1" });
  mockFindOnePending.mockReturnValue(null);
  mockCreate.mockResolvedValue({ _id: REQ_ID });
});

describe("POST /api/subscriptions/upgrade-requests", () => {
  it("refuses while enforcement is off: everyone already has every feature", async () => {
    mockEnforced = false;
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("records the request and tells admins and the employer's agent", async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ toPlanName: "Gold", fromPlanName: "Silver", toPlanPrice: 499 }));
    expect(mockNotifyRequested).toHaveBeenCalledWith(expect.objectContaining({ customerName: "Gulf Retail", agentId: "651000000000000000000d01" }));
  });

  it("allows one open request at a time", async () => {
    mockFindOnePending.mockReturnValue({ toPlanName: "Silver" });
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("is not for staff", async () => {
    mockCtx = { ...mockCtx, role: "agent" };
    expect((await post()).status).toBe(403);
  });
});

describe("PATCH /api/subscriptions/upgrade-requests/[id]", () => {
  it("lets an admin approve: plan applied, customer told", async () => {
    mockCtx = { userId: "651000000000000000000e01", role: "admin", locale: "en" };
    const res = await patch("approve");
    expect(res.status).toBe(200);
    expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ userId: CUSTOMER, planId: PLAN }));
    expect(mockNotifyDecided).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
  });

  it("does not apply twice when another admin decided first", async () => {
    mockCtx = { userId: "651000000000000000000e01", role: "admin", locale: "en" };
    mockClaim.mockResolvedValue(null);
    expect((await patch("approve")).status).toBe(409);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("stops agents and customers from approving", async () => {
    for (const role of ["agent", "super_agent", "employer"]) {
      mockCtx = { userId: CUSTOMER, role, locale: "en" };
      expect((await patch("approve")).status).toBe(403);
    }
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("lets the customer withdraw only their own request", async () => {
    mockCtx = { userId: "651000000000000000000c99", role: "employer", locale: "en" };
    expect((await patch("cancel")).status).toBe(403);
    mockCtx = { userId: CUSTOMER, role: "employer", locale: "en" };
    expect((await patch("cancel")).status).toBe(200);
  });
});
