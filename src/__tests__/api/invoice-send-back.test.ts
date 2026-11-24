/**
 * @jest-environment node
 *
 * Owner decision D2 (docs/plans/2026-11-24-agent-invoice-hires-target.md):
 * an approver sends an agent's invoice back as a draft with a reason, and the
 * agent resubmits it.
 */

import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: connectDB, connectDB }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/integrations/webhookDispatcher", () => ({ dispatchWebhook: jest.fn() }));

const canAccessInvoice = jest.fn().mockResolvedValue(true);
jest.mock("@/lib/invoices/access", () => ({
  canAccessInvoice: (...args: unknown[]) => canAccessInvoice(...args),
}));

const reverseCommissionsForInvoice = jest.fn();
const createCommissionRecordsForInvoice = jest.fn();
jest.mock("@/lib/invoices/commissionRecords", () => ({
  isOwnCommissionLine: () => false,
  approvePendingCommissionsForPaidInvoice: jest.fn(),
  createCommissionRecordsForInvoice: (...args: unknown[]) => createCommissionRecordsForInvoice(...args),
  reverseCommissionsForInvoice: (...args: unknown[]) => reverseCommissionsForInvoice(...args),
  sendCommissionApprovalNotifications: jest.fn(),
}));

const invoiceFindById = jest.fn();
jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: { findById: (...args: unknown[]) => invoiceFindById(...args) },
}));

const ID = "507f1f77bcf86cd799439061";

function makeInvoice(status: string) {
  return {
    _id: ID,
    invoiceNumber: "INV-202611-00001",
    status,
    agentId: "507f1f77bcf86cd799439031",
    totalAmount: 8400,
    amount: 8400,
    currency: "AED",
    commissions: [],
    payments: [],
    save: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn(),
  } as Record<string, unknown> & { save: jest.Mock; status: string };
}

function patch(body: unknown) {
  return new NextRequest(`http://localhost:3000/api/invoices/${ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("Send back and resubmit", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    canAccessInvoice.mockResolvedValue(true);
    auth.mockResolvedValue({ user: { id: "sa_user_001", role: "super_agent", locale: "en" } });
  });

  it("sends an invoice awaiting approval back to its agent as a draft with the reason", async () => {
    const invoice = makeInvoice("pending_approval");
    invoiceFindById.mockResolvedValue(invoice);
    const { PATCH } = await import("@/app/api/invoices/[id]/route");

    const res = await PATCH(patch({ status: "draft", returnReason: "Fee for Maria should be AED 3,500" }), { params: Promise.resolve({ id: ID }) });

    expect(res.status).toBe(200);
    expect(invoice.status).toBe("draft");
    expect(invoice.returnReason).toBe("Fee for Maria should be AED 3,500");
    expect(invoice.returnedBy).toBe("sa_user_001");
    expect(invoice.returnedAt).toBeInstanceOf(Date);
    expect(invoice.save).toHaveBeenCalled();
    expect(reverseCommissionsForInvoice).not.toHaveBeenCalled();
    expect(createCommissionRecordsForInvoice).not.toHaveBeenCalled();
  });

  it("requires a reason to send back", async () => {
    const invoice = makeInvoice("pending_approval");
    invoiceFindById.mockResolvedValue(invoice);
    const { PATCH } = await import("@/app/api/invoices/[id]/route");

    const res = await PATCH(patch({ status: "draft", returnReason: "no" }), { params: Promise.resolve({ id: ID }) });

    expect(res.status).toBe(400);
    expect(invoice.status).toBe("pending_approval");
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("only sends back invoices that are awaiting approval", async () => {
    const invoice = makeInvoice("issued");
    invoiceFindById.mockResolvedValue(invoice);
    const { PATCH } = await import("@/app/api/invoices/[id]/route");

    const res = await PATCH(patch({ status: "draft", returnReason: "Please change the fees" }), { params: Promise.resolve({ id: ID }) });

    expect(res.status).toBe(400);
    expect(invoice.status).toBe("issued");
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("keeps PATCH closed to agents", async () => {
    auth.mockResolvedValue({ user: { id: "agent_user_001", role: "agent", locale: "en" } });
    const invoice = makeInvoice("pending_approval");
    invoiceFindById.mockResolvedValue(invoice);
    const { PATCH } = await import("@/app/api/invoices/[id]/route");

    const res = await PATCH(patch({ status: "draft", returnReason: "Sending my own back" }), { params: Promise.resolve({ id: ID }) });

    expect(res.status).toBe(403);
    expect(invoice.save).not.toHaveBeenCalled();
  });

  describe("POST /api/invoices/[id]/resubmit", () => {
    function resubmit() {
      return new NextRequest(`http://localhost:3000/api/invoices/${ID}/resubmit`, { method: "POST" });
    }

    beforeEach(() => {
      auth.mockResolvedValue({ user: { id: "agent_user_001", role: "agent", locale: "en" } });
    });

    it("lets the agent send their returned draft for approval again", async () => {
      const invoice = makeInvoice("draft");
      invoiceFindById.mockResolvedValue(invoice);
      const { POST } = await import("@/app/api/invoices/[id]/resubmit/route");

      const res = await POST(resubmit(), { params: Promise.resolve({ id: ID }) });

      expect(res.status).toBe(200);
      expect(invoice.status).toBe("pending_approval");
      expect(invoice.save).toHaveBeenCalled();
    });

    it("refuses an invoice the agent can't access", async () => {
      canAccessInvoice.mockResolvedValue(false);
      const invoice = makeInvoice("draft");
      invoiceFindById.mockResolvedValue(invoice);
      const { POST } = await import("@/app/api/invoices/[id]/resubmit/route");

      const res = await POST(resubmit(), { params: Promise.resolve({ id: ID }) });

      expect(res.status).toBe(403);
      expect(invoice.status).toBe("draft");
      expect(invoice.save).not.toHaveBeenCalled();
    });

    it("refuses anything but a draft", async () => {
      const invoice = makeInvoice("issued");
      invoiceFindById.mockResolvedValue(invoice);
      const { POST } = await import("@/app/api/invoices/[id]/resubmit/route");

      const res = await POST(resubmit(), { params: Promise.resolve({ id: ID }) });

      expect(res.status).toBe(400);
      expect(invoice.save).not.toHaveBeenCalled();
    });

    it("refuses employers", async () => {
      auth.mockResolvedValue({ user: { id: "emp_user_001", role: "employer", locale: "en" } });
      const { POST } = await import("@/app/api/invoices/[id]/resubmit/route");

      const res = await POST(resubmit(), { params: Promise.resolve({ id: ID }) });

      expect(res.status).toBe(403);
      expect(invoiceFindById).not.toHaveBeenCalled();
    });
  });
});
