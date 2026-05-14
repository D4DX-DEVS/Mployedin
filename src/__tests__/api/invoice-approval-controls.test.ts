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

jest.mock("@/lib/invoices/commissionRecords", () => ({
  createCommissionRecordsForInvoice: (...args: unknown[]) => createCommissionRecordsForInvoice(...args),
}));

const invoiceFindById = jest.fn();

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: (...args: unknown[]) => invoiceFindById(...args),
  },
}));

function makeInvoice(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

describe("Invoice approval and payment controls", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    createCommissionRecordsForInvoice.mockResolvedValue([{ _id: "comm_001" }]);
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