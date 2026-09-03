/**
 * @jest-environment node
 */

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

const approvePendingCommissionsForPaidInvoice = jest.fn().mockResolvedValue({
  approved: 1,
  notificationFailures: 0,
  approvedCommissionIds: ["comm_001"],
  notifications: [{ userId: "agent_user_001", role: "agent", amount: 100, currency: "AED" }],
  skippedSelfApproval: 0,
  skippedCommissionIds: [],
  approver: { agentId: null, superAgentId: null },
});
const createCommissionRecordsForInvoice = jest.fn().mockResolvedValue([{ _id: "comm_001" }]);
const revertApprovedCommissions = jest.fn().mockResolvedValue(1);
const reverseCommissionsForInvoice = jest.fn().mockResolvedValue({ reversed: 0, alreadyPaid: 0 });
const sendCommissionApprovalNotifications = jest.fn().mockResolvedValue(0);

jest.mock("@/lib/invoices/commissionRecords", () => ({
  // Real predicate — the routes rely on it to skip the approver's own line.
  isOwnCommissionLine: (
    line: { agentId?: unknown; superAgentId?: unknown },
    approver?: { agentId: string | null; superAgentId: string | null },
  ) => {
    if (!approver) return false;
    if (approver.agentId && String(line.agentId ?? "") === approver.agentId) return true;
    if (approver.superAgentId && String(line.superAgentId ?? "") === approver.superAgentId) return true;
    return false;
  },
  approvePendingCommissionsForPaidInvoice: (...args: unknown[]) => approvePendingCommissionsForPaidInvoice(...args),
  createCommissionRecordsForInvoice: (...args: unknown[]) => createCommissionRecordsForInvoice(...args),
  revertApprovedCommissions: (...args: unknown[]) => revertApprovedCommissions(...args),
  reverseCommissionsForInvoice: (...args: unknown[]) => reverseCommissionsForInvoice(...args),
  sendCommissionApprovalNotifications: (...args: unknown[]) => sendCommissionApprovalNotifications(...args),
}));

const invoiceFindById = jest.fn();

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: (...args: unknown[]) => invoiceFindById(...args),
  },
}));

interface MockInvoicePayment {
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  recordedBy?: unknown;
}

interface MockInvoiceCommission {
  role: "agent" | "super_agent";
  agentId?: string;
  superAgentId?: string;
  rate: number;
  amount: number;
  status: "pending" | "approved" | "paid" | "disputed";
}

interface MockInvoice {
  _id: string;
  invoiceNumber: string;
  status: string;
  notes?: string;
  internalNotes?: string;
  totalAmount: number;
  amount: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  commissions: MockInvoiceCommission[];
  payments: MockInvoicePayment[];
  save: jest.Mock<Promise<void>, []>;
  /** Mongoose Document API the paid paths call before a payment save (version check). */
  increment: jest.Mock<void, []>;
  approvedBy?: unknown;
  approvedAt?: Date;
  rejectedBy?: unknown;
  rejectedAt?: Date;
  rejectionReason?: string;
  voidReason?: string;
  voidedBy?: unknown;
  voidedAt?: Date;
  paidAt?: Date;
  markedPaidBy?: unknown;
}

function makeInvoice(overrides: Partial<MockInvoice> = {}): MockInvoice {
  return {
    _id: "507f1f77bcf86cd799439061",
    invoiceNumber: "INV-202605-00001",
    status: "pending_approval",
    notes: undefined,
    internalNotes: undefined,
    totalAmount: 1000,
    amount: 1000,
    paidAmount: 0,
    balanceDue: 1000,
    currency: "AED",
    commissions: [{ role: "agent", agentId: "507f1f77bcf86cd799439031", rate: 10, amount: 100, status: "pending" }],
    payments: [],
    save: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn(),
    ...overrides,
  };
}

describe("Invoice approval and payment controls", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    approvePendingCommissionsForPaidInvoice.mockResolvedValue({
      approved: 1,
      notificationFailures: 0,
      approvedCommissionIds: ["comm_001"],
      notifications: [{ userId: "agent_user_001", role: "agent", amount: 100, currency: "AED" }],
      skippedSelfApproval: 0,
      skippedCommissionIds: [],
      approver: { agentId: null, superAgentId: null },
    });
    createCommissionRecordsForInvoice.mockResolvedValue([{ _id: "comm_001" }]);
    revertApprovedCommissions.mockResolvedValue(1);
    reverseCommissionsForInvoice.mockResolvedValue({ reversed: 0, alreadyPaid: 0 });
    sendCommissionApprovalNotifications.mockResolvedValue(0);
  });

  it("approves a pending invoice and creates commission records", async () => {
    const invoice = makeInvoice();
    invoiceFindById.mockResolvedValue(invoice);

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439061", {
      method: "PATCH",
      body: JSON.stringify({ status: "issued" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439061" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(invoice.status).toBe("issued");
    expect(invoice.approvedBy).toBe("admin_001");
    expect(invoice.approvedAt).toBeInstanceOf(Date);
    expect(invoice.save).toHaveBeenCalled();
    expect(createCommissionRecordsForInvoice).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: invoice._id,
      currency: "AED",
    }));
    expect(json.commissionsCreated).toBe(1);
  });

  it("rejects a pending invoice with rejection metadata", async () => {
    const invoice = makeInvoice();
    invoiceFindById.mockResolvedValue(invoice);

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439061", {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", rejectionReason: "Incorrect amount" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439061" }) });

    expect(res.status).toBe(200);
    expect(invoice.status).toBe("cancelled");
    expect(invoice.rejectedBy).toBe("admin_001");
    expect(invoice.rejectedAt).toBeInstanceOf(Date);
    expect(invoice.rejectionReason).toBe("Incorrect amount");
    expect(invoice.voidReason).toBe("Incorrect amount");
    expect(createCommissionRecordsForInvoice).not.toHaveBeenCalled();
  });

  it("does not allow non-pending invoices to be rejected", async () => {
    const invoice = makeInvoice({ status: "draft" });
    invoiceFindById.mockResolvedValue(invoice);

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439061", {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", rejectionReason: "Not ready" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439061" }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("pending approval");
    expect(invoice.status).toBe("draft");
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("blocks agents from approving invoices", async () => {
    auth.mockResolvedValue({ user: { id: "agent_user_001", role: "agent", locale: "en" } });

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439061", {
      method: "PATCH",
      body: JSON.stringify({ status: "issued" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439061" }) });

    expect(res.status).toBe(403);
    expect(invoiceFindById).not.toHaveBeenCalled();
  });

  it("marking an issued invoice paid records the remaining balance as a payment", async () => {
    const invoice = makeInvoice({
      status: "issued",
      totalAmount: 1000,
      amount: 1000,
      paidAmount: 250,
      balanceDue: 750,
      payments: [
        {
          amount: 250,
          paymentDate: new Date("2026-05-01T00:00:00.000Z"),
          paymentMethod: "bank_transfer",
          recordedBy: "admin_001",
        },
      ],
    });
    invoiceFindById.mockResolvedValue(invoice);

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439061", {
      method: "PATCH",
      body: JSON.stringify({ status: "paid" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439061" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(invoice.status).toBe("paid");
    expect(invoice.paidAmount).toBe(1000);
    expect(invoice.balanceDue).toBe(0);
    expect(invoice.payments).toHaveLength(2);
    expect(invoice.payments[1]).toEqual(expect.objectContaining({
      amount: 750,
      paymentMethod: "other",
      referenceNumber: "STATUS-PAID",
      recordedBy: "admin_001",
    }));
    expect(invoice.commissions[0].status).toBe("approved");
    expect(approvePendingCommissionsForPaidInvoice).toHaveBeenCalledWith(invoice._id, "admin_001", expect.objectContaining({ sendNotifications: false }));
    expect(sendCommissionApprovalNotifications).toHaveBeenCalledWith([
      { userId: "agent_user_001", role: "agent", amount: 100, currency: "AED" },
    ]);
    expect(json.commissionsApproved).toBe(1);
  });

  it("blocks payments on pending approval invoices", async () => {
    const invoice = makeInvoice({ payments: [], status: "pending_approval" });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/payments/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439061/payments", {
      method: "POST",
      body: JSON.stringify({ amount: 100, paymentMethod: "bank_transfer" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439061" }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("pending_approval");
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("blocks payments on draft invoices", async () => {
    const invoice = makeInvoice({ payments: [], status: "draft" });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/payments/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439061/payments", {
      method: "POST",
      body: JSON.stringify({ amount: 100, paymentMethod: "bank_transfer" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439061" }) });

    expect(res.status).toBe(400);
    expect(invoice.save).not.toHaveBeenCalled();
  });
});