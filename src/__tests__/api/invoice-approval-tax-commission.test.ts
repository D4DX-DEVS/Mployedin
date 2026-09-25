/**
 * @jest-environment node
 */
// Test for INV-04: Commission recomputation on approval should use pre-tax subtotal,
// not include tax, and should NOT recompute manually-overridden rates.

import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: connectDB,
  connectDB,
}));

jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  const session = {
    withTransaction: async (fn: () => Promise<unknown>) => fn(),
    endSession: jest.fn(),
  };
  const startSession = jest.fn().mockResolvedValue(session);
  return {
    ...actual,
    __esModule: true,
    default: Object.assign(Object.create(actual.default ?? actual), { startSession }),
    startSession,
  };
});

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

const createCommissionRecordsForInvoice = jest.fn().mockResolvedValue([{ _id: "comm_001" }]);
const reverseCommissionsForInvoice = jest.fn().mockResolvedValue({ reversed: 0, alreadyPaid: 0 });

jest.mock("@/lib/invoices/commissionRecords", () => ({
  isOwnCommissionLine: (
    line: { agentId?: unknown; superAgentId?: unknown },
    approver?: { agentId: string | null; superAgentId: string | null },
  ) => {
    if (!approver) return false;
    if (approver.agentId && String(line.agentId ?? "") === approver.agentId) return true;
    if (approver.superAgentId && String(line.superAgentId ?? "") === approver.superAgentId) return true;
    return false;
  },
  approvePendingCommissionsForPaidInvoice: jest.fn(),
  createCommissionRecordsForInvoice: (...args: unknown[]) => createCommissionRecordsForInvoice(...args),
  revertApprovedCommissions: jest.fn(),
  reverseCommissionsForInvoice: (...args: unknown[]) => reverseCommissionsForInvoice(...args),
  sendCommissionApprovalNotifications: jest.fn(),
}));

const resolveCommissionRate = jest.fn();
const resolveOverrideRate = jest.fn();

jest.mock("@/lib/commissions/resolveRate", () => ({
  resolveCommissionRate: (...args: unknown[]) => resolveCommissionRate(...args),
  resolveOverrideRate: (...args: unknown[]) => resolveOverrideRate(...args),
}));

const invoiceFindById = jest.fn();

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: (...args: unknown[]) => invoiceFindById(...args),
  },
}));

const agentFindById = jest.fn();

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findById: (...args: unknown[]) => ({
      lean: () => agentFindById(...args),
    }),
  },
}));

const superAgentFindById = jest.fn();

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findById: (...args: unknown[]) => ({
      lean: () => superAgentFindById(...args),
    }),
  },
}));

const employerFindById = jest.fn();

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    findById: (...args: unknown[]) => ({
      select: () => ({
        lean: () => employerFindById(...args),
      }),
    }),
  },
}));

interface MockInvoice {
  _id: string;
  invoiceNumber: string;
  status: string;
  agentId?: string;
  employerId?: string;
  totalAmount: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  serviceCharge: number;
  commissions: Array<{
    role: "agent" | "super_agent";
    agentId?: string;
    superAgentId?: string;
    rate: number;
    amount: number;
    status: string;
    notes?: string;
  }>;
  save: jest.Mock<Promise<void>, []>;
  increment: jest.Mock<void, []>;
  approvedBy?: unknown;
  approvedAt?: Date;
}

function makeInvoice(overrides: Partial<MockInvoice> = {}): MockInvoice {
  return {
    _id: "607f1f77bcf86cd799439062",
    invoiceNumber: "INV-202609-00068",
    status: "pending_approval",
    agentId: "507f1f77bcf86cd799439031",
    employerId: "507f1f77bcf86cd799439032",
    subtotal: 1000,
    discountPercent: 0,
    discountAmount: 0,
    taxPercent: 18,
    taxAmount: 180,
    serviceCharge: 0,
    totalAmount: 1180, // subtotal + tax
    commissions: [
      {
        role: "agent",
        agentId: "507f1f77bcf86cd799439031",
        rate: 10,
        amount: 100, // Correctly computed on subtotal (1000 * 10%)
        status: "pending",
        notes: "Agent placement commission",
      },
    ],
    save: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn(),
    ...overrides,
  };
}

describe("Invoice approval with tax — commission recomputation", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    createCommissionRecordsForInvoice.mockResolvedValue([{ _id: "comm_001" }]);
    reverseCommissionsForInvoice.mockResolvedValue({ reversed: 0, alreadyPaid: 0 });
    resolveCommissionRate.mockResolvedValue({ rate: 10, source: "profile" });
    resolveOverrideRate.mockResolvedValue({ rate: 5, source: "profile" });
    agentFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439031",
      commissionRate: 10,
      superAgentId: null,
    });
    superAgentFindById.mockResolvedValue(null);
    employerFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439032",
      country: "AE",
    });
  });

  it("BUG: currently recomputes commission on tax-inclusive totalAmount (1180) instead of discountedSubtotal (1000)", async () => {
    // This test documents the bug: commission is incorrectly computed as 1180 * 10% = 118 instead of 1000 * 10% = 100
    const invoice = makeInvoice();
    invoiceFindById.mockResolvedValue(invoice);

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/607f1f77bcf86cd799439062", {
      method: "PATCH",
      body: JSON.stringify({ status: "issued" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "607f1f77bcf86cd799439062" }) });

    expect(res.status).toBe(200);
    // BUG: Commission amount was recomputed on totalAmount (tax-inclusive)
    // Current (buggy) behavior: 1180 * 10% = 118
    // After fix: Should stay 100 (computed on 1000 discountedSubtotal)
    const commissionLine = invoice.commissions[0];
    // This assertion will FAIL before fix, showing the bug
    expect(commissionLine.amount).toBe(100); // Pre-fix this will be 118
  });

  it("FIXED: does NOT recompute commission if it has [Manual override] marker", async () => {
    const invoice = makeInvoice({
      commissions: [
        {
          role: "agent",
          agentId: "507f1f77bcf86cd799439031",
          rate: 15, // Manual override to 15%
          amount: 150, // Correctly computed on 1000 * 15% at creation
          status: "pending",
          notes: "Agent placement commission [Manual override]", // Marker indicates manual override
        },
      ],
    });
    invoiceFindById.mockResolvedValue(invoice);

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/607f1f77bcf86cd799439062", {
      method: "PATCH",
      body: JSON.stringify({ status: "issued" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "607f1f77bcf86cd799439062" }) });

    expect(res.status).toBe(200);
    const commissionLine = invoice.commissions[0];
    // After fix: manual override should NOT be recomputed
    expect(commissionLine.amount).toBe(150); // Should stay 150, not become 177 (1180 * 15%)
    expect(commissionLine.rate).toBe(15); // Rate should not change
  });

  it("FIXED: recomputes commission on discountedSubtotal for non-manual-override rates", async () => {
    const invoice = makeInvoice({
      subtotal: 1000,
      discountPercent: 10,
      discountAmount: 100,
      taxPercent: 18,
      taxAmount: 162, // 900 * 18%
      totalAmount: 1062, // 900 + 162
      commissions: [
        {
          role: "agent",
          agentId: "507f1f77bcf86cd799439031",
          rate: 10,
          amount: 90, // Correctly computed on 900 discountedSubtotal at creation
          status: "pending",
          notes: "Agent placement commission", // No manual override marker
        },
      ],
    });
    invoiceFindById.mockResolvedValue(invoice);
    agentFindById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439031",
      commissionRate: 10,
      superAgentId: null,
    });
    resolveCommissionRate.mockResolvedValue({ rate: 12, source: "country_override" });

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/607f1f77bcf86cd799439062", {
      method: "PATCH",
      body: JSON.stringify({ status: "issued" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "607f1f77bcf86cd799439062" }) });

    expect(res.status).toBe(200);
    const commissionLine = invoice.commissions[0];
    // After fix: commission recomputed on discountedSubtotal (900) with new rate (12%)
    expect(commissionLine.amount).toBe(108); // 900 * 12%
    expect(commissionLine.rate).toBe(12); // Rate updated from resolution
    expect(commissionLine.notes).toContain("Country override"); // Source noted
  });

  it("keeps the combined rate guard after fixing tax bug", async () => {
    const invoice = makeInvoice({
      agentId: "507f1f77bcf86cd799439031",
      commissions: [
        {
          role: "agent",
          agentId: "507f1f77bcf86cd799439031",
          rate: 70,
          amount: 700,
          status: "pending",
          notes: "Agent placement commission",
        },
        {
          role: "super_agent",
          superAgentId: "507f1f77bcf86cd799439033",
          rate: 40, // Combined: 70 + 40 = 110% > 100%
          amount: 400,
          status: "pending",
          notes: "Super-agent override commission",
        },
      ],
    });
    invoiceFindById.mockResolvedValue(invoice);
    resolveCommissionRate.mockResolvedValue({ rate: 70, source: "profile" });
    resolveOverrideRate.mockResolvedValue({ rate: 40, source: "profile" });

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/607f1f77bcf86cd799439062", {
      method: "PATCH",
      body: JSON.stringify({ status: "issued" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "607f1f77bcf86cd799439062" }) });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("100%");
  });
});
