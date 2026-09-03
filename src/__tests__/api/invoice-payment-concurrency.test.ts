/**
 * @jest-environment node
 */
/**
 * Lost-update guard on the three manual "invoice becomes paid" paths.
 *
 * Mongoose only version-checks a save() for positional array edits; a plain
 * `payments.push()` bumps `__v` but does not add it to the update filter, so two
 * requests that loaded the same invoice both pass the overpayment check and both
 * save (reproduced: 2 × 600 recorded against a 1000 invoice, paidAmount stale).
 * `doc.increment()` before save() makes the write conditional on `__v`; the
 * loser gets a VersionError, which these routes must turn into 409 — never a
 * silent 200 and never a commission approval.
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

const dispatchWebhook = jest.fn();
jest.mock("@/lib/integrations/webhookDispatcher", () => ({
  dispatchWebhook: (...args: unknown[]) => dispatchWebhook(...args),
}));

const notify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notify: (...args: unknown[]) => notify(...args),
  notifyCommissionApproved: jest.fn().mockResolvedValue(undefined),
}));

const approvePendingCommissionsForPaidInvoice = jest.fn();
const createCommissionRecordsForInvoice = jest.fn();
jest.mock("@/lib/invoices/commissionRecords", () => ({
  isOwnCommissionLine: () => false,
  resolveCommissionApprover: jest.fn().mockResolvedValue({ agentId: null, superAgentId: null }),
  approvePendingCommissionsForPaidInvoice: (...args: unknown[]) => approvePendingCommissionsForPaidInvoice(...args),
  createCommissionRecordsForInvoice: (...args: unknown[]) => createCommissionRecordsForInvoice(...args),
  revertApprovedCommissions: jest.fn().mockResolvedValue(0),
  reverseCommissionsForInvoice: jest.fn().mockResolvedValue({ reversed: 0, alreadyPaid: 0 }),
  sendCommissionApprovalNotifications: jest.fn().mockResolvedValue(0),
}));

const invoiceFindById = jest.fn();
jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: (...args: unknown[]) => invoiceFindById(...args),
  },
}));

const INVOICE_ID = "507f1f77bcf86cd799439061";

function versionError() {
  const { VersionError } = jest.requireActual("mongoose").Error;
  return new VersionError({ _doc: { _id: INVOICE_ID } }, 3, ["payments"]);
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    _id: INVOICE_ID,
    invoiceNumber: "INV-202605-00001",
    userId: "employer_user_001",
    status: "issued",
    totalAmount: 1000,
    amount: 1000,
    paidAmount: 0,
    balanceDue: 1000,
    currency: "AED",
    commissions: [{ role: "agent", agentId: "507f1f77bcf86cd799439031", rate: 10, amount: 100, status: "pending" }],
    payments: [] as Array<Record<string, unknown>>,
    paymentNotifications: [{ verified: false, paymentMethod: "bank_transfer", referenceNumber: "REF-1" }],
    save: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn(),
    ...overrides,
  };
}

function firstCall(mock: jest.Mock): number {
  return mock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
}

describe("manual paid paths are safe against a concurrent payment on the same invoice", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    approvePendingCommissionsForPaidInvoice.mockResolvedValue({
      approved: 0,
      notificationFailures: 0,
      approvedCommissionIds: [],
      notifications: [],
      skippedSelfApproval: 0,
      skippedCommissionIds: [],
      approver: { agentId: null, superAgentId: null },
    });
    createCommissionRecordsForInvoice.mockResolvedValue([]);
  });

  describe("POST /api/invoices/[id]/payments", () => {
    const post = async (invoice: ReturnType<typeof makeInvoice>) => {
      invoiceFindById.mockResolvedValue(invoice);
      const { POST } = await import("@/app/api/invoices/[id]/payments/route");
      const req = new NextRequest(`http://localhost:3000/api/invoices/${INVOICE_ID}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: 600, paymentMethod: "bank_transfer" }),
        headers: { "Content-Type": "application/json" },
      });
      return POST(req, { params: Promise.resolve({ id: INVOICE_ID }) });
    };

    it("version-checks the save that records the payment", async () => {
      const invoice = makeInvoice();
      const res = await post(invoice);
      expect(res.status).toBe(200);
      expect(invoice.increment).toHaveBeenCalledTimes(1);
      expect(firstCall(invoice.increment)).toBeLessThan(firstCall(invoice.save));
    });

    it("returns 409 and approves nothing when another payment landed first", async () => {
      const invoice = makeInvoice();
      invoice.save.mockRejectedValueOnce(versionError());
      const res = await post(invoice);
      const json = await res.json();
      expect(res.status).toBe(409);
      expect(json.error).toMatch(/modified|changed|retry/i);
      expect(approvePendingCommissionsForPaidInvoice).not.toHaveBeenCalled();
      expect(dispatchWebhook).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/invoices/[id] { status: paid }", () => {
    const patch = async (invoice: ReturnType<typeof makeInvoice>) => {
      invoiceFindById.mockResolvedValue(invoice);
      const { PATCH } = await import("@/app/api/invoices/[id]/route");
      const req = new NextRequest(`http://localhost:3000/api/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "paid" }),
        headers: { "Content-Type": "application/json" },
      });
      return PATCH(req, { params: Promise.resolve({ id: INVOICE_ID }) });
    };

    it("version-checks the save that marks the invoice paid", async () => {
      const invoice = makeInvoice();
      const res = await patch(invoice);
      expect(res.status).toBe(200);
      expect(invoice.increment).toHaveBeenCalledTimes(1);
      expect(firstCall(invoice.increment)).toBeLessThan(firstCall(invoice.save));
    });

    it("returns 409 instead of a silent 200 when the invoice changed underneath", async () => {
      const invoice = makeInvoice();
      invoice.save.mockRejectedValueOnce(versionError());
      const res = await patch(invoice);
      const json = await res.json();
      expect(res.status).toBe(409);
      expect(json.error).toMatch(/modified|changed|retry/i);
      expect(approvePendingCommissionsForPaidInvoice).not.toHaveBeenCalled();
      expect(dispatchWebhook).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/invoices/[id]/verify-payment (approve)", () => {
    const verify = async (invoice: ReturnType<typeof makeInvoice>) => {
      invoiceFindById.mockResolvedValue(invoice);
      const { POST } = await import("@/app/api/invoices/[id]/verify-payment/route");
      const req = new NextRequest(`http://localhost:3000/api/invoices/${INVOICE_ID}/verify-payment`, {
        method: "POST",
        body: JSON.stringify({ notificationIndex: 0, action: "approve" }),
        headers: { "Content-Type": "application/json" },
      });
      return POST(req, { params: Promise.resolve({ id: INVOICE_ID }) });
    };

    it("version-checks the save that records the verified payment", async () => {
      const invoice = makeInvoice();
      const res = await verify(invoice);
      expect(res.status).toBe(200);
      expect(invoice.increment).toHaveBeenCalledTimes(1);
      expect(firstCall(invoice.increment)).toBeLessThan(firstCall(invoice.save));
    });

    it("returns 409 and creates nothing when the invoice changed underneath", async () => {
      const invoice = makeInvoice();
      invoice.save.mockRejectedValueOnce(versionError());
      const res = await verify(invoice);
      const json = await res.json();
      expect(res.status).toBe(409);
      expect(json.error).toMatch(/modified|changed|retry/i);
      expect(createCommissionRecordsForInvoice).not.toHaveBeenCalled();
      expect(approvePendingCommissionsForPaidInvoice).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });
  });
});
