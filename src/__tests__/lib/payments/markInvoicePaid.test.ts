/**
 * @jest-environment node
 */
import { markInvoicePaid } from "@/lib/payments/markInvoicePaid";

jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
const dispatchWebhook = jest.fn();
jest.mock("@/lib/integrations/webhookDispatcher", () => ({ dispatchWebhook: (...a: unknown[]) => dispatchWebhook(...a) }));

const createCommissionRecordsForInvoice = jest.fn().mockResolvedValue([]);
const approvePendingCommissionsForPaidInvoice = jest.fn();
jest.mock("@/lib/invoices/commissionRecords", () => ({
  createCommissionRecordsForInvoice: (...a: unknown[]) => createCommissionRecordsForInvoice(...a),
  approvePendingCommissionsForPaidInvoice: (...a: unknown[]) => approvePendingCommissionsForPaidInvoice(...a),
  isOwnCommissionLine: () => false,
}));

const applyPaidInvoiceToSubscription = jest.fn().mockResolvedValue({ status: "applied" });
jest.mock("@/lib/payments/subscriptionFulfillment", () => ({
  applyPaidInvoiceToSubscription: (...a: unknown[]) => applyPaidInvoiceToSubscription(...a),
}));

const findById = jest.fn();
jest.mock("@/models/Invoice", () => ({ __esModule: true, default: { findById: (...a: unknown[]) => findById(...a) } }));

const ID = "507f1f77bcf86cd799439061";

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    _id: ID,
    invoiceNumber: "INV-1",
    userId: "user1",
    category: "recruitment",
    status: "issued",
    totalAmount: 1000,
    amount: 1000,
    paidAmount: 0,
    refundedAmount: 0,
    balanceDue: 1000,
    currency: "AED",
    commissions: [{ role: "agent", agentId: "a1", rate: 10, amount: 100, status: "pending" }],
    payments: [] as Array<Record<string, unknown>>,
    save: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn(),
    ...overrides,
  };
}

const gateway = { provider: "stripe" as const, paymentId: "pi_1", currency: "AED", method: "card" };

beforeEach(() => {
  jest.clearAllMocks();
  approvePendingCommissionsForPaidInvoice.mockResolvedValue({
    approved: 1, notificationFailures: 0, approvedCommissionIds: ["c1"], notifications: [],
    skippedSelfApproval: 0, skippedCommissionIds: [], approver: { agentId: null, superAgentId: null },
  });
});

describe("markInvoicePaid", () => {
  it("full payment → paid, commissions created + approved, webhook + subscription hook", async () => {
    const inv = makeInvoice();
    findById.mockResolvedValue(inv);
    const res = await markInvoicePaid(ID, { ...gateway, amount: 1000 });

    expect(res.status).toBe("paid");
    expect(inv.status).toBe("paid");
    expect(inv.balanceDue).toBe(0);
    expect(inv.payments).toHaveLength(1);
    expect(inv.payments[0]).toMatchObject({ amount: 1000, paymentMethod: "credit_card", referenceNumber: "pi_1" });
    expect(inv.increment).toHaveBeenCalled();
    expect(createCommissionRecordsForInvoice).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: ID, currency: "AED" }));
    expect(approvePendingCommissionsForPaidInvoice).toHaveBeenCalledWith(ID, "user1", { sendNotifications: true });
    expect(inv.commissions[0].status).toBe("approved");
    expect(dispatchWebhook).toHaveBeenCalledWith("invoice.paid", expect.objectContaining({ invoiceId: ID }), null);
    expect(applyPaidInvoiceToSubscription).toHaveBeenCalledTimes(1);
  });

  it("partial payment → partially_paid, no commissions, no subscription activation", async () => {
    const inv = makeInvoice();
    findById.mockResolvedValue(inv);
    const res = await markInvoicePaid(ID, { ...gateway, amount: 400 });

    expect(res.status).toBe("partially_paid");
    expect(inv.status).toBe("partially_paid");
    expect(inv.balanceDue).toBe(600);
    expect(createCommissionRecordsForInvoice).not.toHaveBeenCalled();
    expect(applyPaidInvoiceToSubscription).not.toHaveBeenCalled();
  });

  it("second partial payment completing the balance → paid", async () => {
    const inv = makeInvoice({ status: "partially_paid", paidAmount: 400, balanceDue: 600, payments: [{ amount: 400, referenceNumber: "pi_0" }] });
    findById.mockResolvedValue(inv);
    const res = await markInvoicePaid(ID, { ...gateway, amount: 600 });
    expect(res.status).toBe("paid");
    expect(createCommissionRecordsForInvoice).toHaveBeenCalledTimes(1);
  });

  it("is idempotent by provider payment id (duplicate delivery → single payment)", async () => {
    const inv = makeInvoice();
    findById.mockResolvedValue(inv);
    await markInvoicePaid(ID, { ...gateway, amount: 1000 });
    const again = await markInvoicePaid(ID, { ...gateway, amount: 1000 });

    expect(again.status).toBe("already_processed");
    expect(inv.payments).toHaveLength(1);
    expect(createCommissionRecordsForInvoice).toHaveBeenCalledTimes(1);
  });

  it.each(["void", "cancelled", "refunded", "draft", "pending_approval"])("refuses a %s invoice", async (status) => {
    const inv = makeInvoice({ status });
    findById.mockResolvedValue(inv);
    const res = await markInvoicePaid(ID, { ...gateway, amount: 1000 });
    expect(res).toMatchObject({ status: "rejected", reason: "invoice_not_payable" });
    expect(inv.save).not.toHaveBeenCalled();
  });

  it("refuses a second, different payment on an already-paid invoice", async () => {
    findById.mockResolvedValue(makeInvoice({ status: "paid", paidAmount: 1000, balanceDue: 0, payments: [{ amount: 1000, referenceNumber: "pi_0" }] }));
    expect(await markInvoicePaid(ID, { ...gateway, amount: 1000 })).toMatchObject({ status: "rejected", reason: "already_paid" });
  });

  it("refuses currency mismatch and amounts above the balance", async () => {
    findById.mockResolvedValue(makeInvoice());
    expect(await markInvoicePaid(ID, { ...gateway, currency: "USD", amount: 1000 })).toMatchObject({ reason: "currency_mismatch" });
    findById.mockResolvedValue(makeInvoice());
    expect(await markInvoicePaid(ID, { ...gateway, amount: 1000.01 })).toMatchObject({ reason: "amount_exceeds_balance" });
    findById.mockResolvedValue(makeInvoice());
    expect(await markInvoicePaid(ID, { ...gateway, amount: 0 })).toMatchObject({ reason: "invalid_amount" });
  });

  it("reloads and retries when a concurrent write wins (id form)", async () => {
    const { VersionError } = jest.requireActual("mongoose").Error;
    const first = makeInvoice();
    first.save.mockRejectedValueOnce(new VersionError({ _doc: { _id: ID } }, 1, ["payments"]));
    const second = makeInvoice();
    findById.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const res = await markInvoicePaid(ID, { ...gateway, amount: 1000 });
    expect(res.status).toBe("paid");
    expect(findById).toHaveBeenCalledTimes(2);
  });

  it("returns conflict for a preloaded document (manual path → 409)", async () => {
    const { VersionError } = jest.requireActual("mongoose").Error;
    const inv = makeInvoice();
    inv.save.mockRejectedValueOnce(new VersionError({ _doc: { _id: ID } }, 1, ["payments"]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await markInvoicePaid(inv as any, { provider: "manual", paymentId: "REF-1", amount: 1000, currency: "AED", actorUserId: "admin1" });
    expect(res.status).toBe("conflict");
    expect(createCommissionRecordsForInvoice).not.toHaveBeenCalled();
  });

  it("manual verification records the staff user as approver and marker", async () => {
    const inv = makeInvoice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await markInvoicePaid(inv as any, { provider: "manual", paymentId: "REF-1", amount: 1000, currency: "AED", method: "bank_transfer", actorUserId: "admin1", notifyPayer: false });
    expect(res.status).toBe("paid");
    expect(inv.payments[0]).toMatchObject({ paymentMethod: "bank_transfer", recordedBy: "admin1" });
    expect(approvePendingCommissionsForPaidInvoice).toHaveBeenCalledWith(ID, "admin1", { sendNotifications: true });
    expect((inv as Record<string, unknown>).markedPaidBy).toBe("admin1");
  });
});
