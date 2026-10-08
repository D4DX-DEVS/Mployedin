/**
 * @jest-environment node
 */
import crypto from "crypto";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/integrations/webhookDispatcher", () => ({ dispatchWebhook: jest.fn() }));

const createCommissionRecordsForInvoice = jest.fn().mockResolvedValue([]);
jest.mock("@/lib/invoices/commissionRecords", () => ({
  createCommissionRecordsForInvoice: (...a: unknown[]) => createCommissionRecordsForInvoice(...a),
  approvePendingCommissionsForPaidInvoice: jest.fn().mockResolvedValue({
    approved: 0, notificationFailures: 0, approvedCommissionIds: [], notifications: [],
    skippedSelfApproval: 0, skippedCommissionIds: [], approver: { agentId: null, superAgentId: null },
  }),
  isOwnCommissionLine: () => false,
  clawBackCommissionsForRefund: jest.fn().mockResolvedValue({ clawedBack: 0, annotated: 0 }),
}));

const applyPaidInvoiceToSubscription = jest.fn().mockResolvedValue({ status: "applied" });
const markSubscriptionPastDue = jest.fn().mockResolvedValue(true);
jest.mock("@/lib/payments/subscriptionFulfillment", () => ({
  applyPaidInvoiceToSubscription: (...a: unknown[]) => applyPaidInvoiceToSubscription(...a),
  markSubscriptionPastDue: (...a: unknown[]) => markSubscriptionPastDue(...a),
}));

// Unique-index emulation for the idempotency ledger.
const ledger = new Set<string>();
const paymentEventCreate = jest.fn(async (doc: { provider: string; eventId: string }) => {
  const key = `${doc.provider}:${doc.eventId}`;
  if (ledger.has(key)) throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  ledger.add(key);
  return doc;
});
const paymentEventDelete = jest.fn(async (q: { provider: string; eventId: string }) => {
  ledger.delete(`${q.provider}:${q.eventId}`);
});
jest.mock("@/models/PaymentEvent", () => ({
  __esModule: true,
  default: {
    create: (doc: { provider: string; eventId: string }) => paymentEventCreate(doc),
    updateOne: jest.fn().mockResolvedValue({}),
    deleteOne: (q: { provider: string; eventId: string }) => paymentEventDelete(q),
  },
}));

const INVOICE_ID = "507f1f77bcf86cd799439061";
let invoiceDoc: Record<string, unknown> & { payments: Array<Record<string, unknown>> };
const invoiceFindByIdAndUpdate = jest.fn();
jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(async () => invoiceDoc),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
    findByIdAndUpdate: (...a: unknown[]) => invoiceFindByIdAndUpdate(...a),
  },
}));

const SECRET = "whsec_webhook_route_test";

function makeInvoice() {
  return {
    _id: INVOICE_ID, invoiceNumber: "INV-1", userId: "user1", category: "subscription", type: "upgrade",
    status: "issued", totalAmount: 600, amount: 600, paidAmount: 0, refundedAmount: 0, balanceDue: 600,
    currency: "AED", commissions: [], payments: [] as Array<Record<string, unknown>>,
    save: jest.fn().mockResolvedValue(undefined), increment: jest.fn(),
  };
}

function stripeRequest(obj: Record<string, unknown>, opts: { sign?: boolean; secret?: string } = {}) {
  const body = JSON.stringify(obj);
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", opts.secret ?? SECRET).update(`${t}.${body}`).digest("hex");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.sign !== false) headers["stripe-signature"] = `t=${t},v1=${v1}`;
  return new NextRequest("http://localhost:3889/api/payments/webhook", { method: "POST", body, headers });
}

const completed = (eventId: string, paymentIntent = "pi_1") => ({
  id: eventId,
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_1", payment_status: "paid", payment_intent: paymentIntent, amount_total: 60000, currency: "aed",
      client_reference_id: INVOICE_ID, metadata: { invoiceId: INVOICE_ID }, payment_method_types: ["card"],
    },
  },
});

async function post(req: NextRequest) {
  const { POST } = await import("@/app/api/payments/webhook/route");
  return POST(req);
}

beforeEach(() => {
  jest.clearAllMocks();
  ledger.clear();
  invoiceDoc = makeInvoice();
  process.env.PAYMENT_PROVIDER = "stripe";
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe("POST /api/payments/webhook", () => {
  it("rejects a bad signature with 400 and touches nothing", async () => {
    const res = await post(stripeRequest(completed("evt_1"), { secret: "whsec_wrong" }));
    expect(res.status).toBe(400);
    expect(paymentEventCreate).not.toHaveBeenCalled();
    expect(invoiceDoc.payments).toHaveLength(0);
  });

  it("rejects an unsigned request with 400", async () => {
    const req = stripeRequest(completed("evt_1"), { sign: false });
    const res = await (await import("@/app/api/payments/webhook/route")).POST(
      new NextRequest("http://localhost:3889/api/payments/webhook?provider=stripe", { method: "POST", body: await req.text() }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when the gateway is not configured", async () => {
    delete process.env.PAYMENT_PROVIDER;
    const res = await post(stripeRequest(completed("evt_1")));
    expect(res.status).toBe(503);
  });

  it("records the payment once and activates the subscription", async () => {
    const res = await post(stripeRequest(completed("evt_1")));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.outcome).toBe("paid");
    expect(invoiceDoc.status).toBe("paid");
    expect(invoiceDoc.payments).toHaveLength(1);
    expect(applyPaidInvoiceToSubscription).toHaveBeenCalledTimes(1);
  });

  it("duplicate delivery of the same event → single payment", async () => {
    await post(stripeRequest(completed("evt_dup")));
    const second = await post(stripeRequest(completed("evt_dup")));
    expect(second.status).toBe(200);
    expect((await second.json()).duplicate).toBe(true);
    expect(invoiceDoc.payments).toHaveLength(1);
    expect(createCommissionRecordsForInvoice).toHaveBeenCalledTimes(1);
  });

  it("same payment under a different event id is still applied once", async () => {
    await post(stripeRequest(completed("evt_a")));
    const res = await post(stripeRequest({ ...completed("evt_b"), type: "checkout.session.async_payment_succeeded" }));
    expect((await res.json()).outcome).toBe("already_processed");
    expect(invoiceDoc.payments).toHaveLength(1);
  });

  it("acknowledges unhandled events fast without claiming them", async () => {
    const res = await post(stripeRequest({ id: "evt_x", type: "customer.created", data: { object: { id: "cus_1" } } }));
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe("customer.created");
    expect(paymentEventCreate).not.toHaveBeenCalled();
  });

  it("releases the event claim and answers 500 when processing throws (provider retries)", async () => {
    invoiceDoc.save = jest.fn().mockRejectedValue(new Error("db down"));
    const res = await post(stripeRequest(completed("evt_fail")));
    expect(res.status).toBe(500);
    expect(paymentEventDelete).toHaveBeenCalledWith({ provider: "stripe", eventId: "evt_fail" });
    expect(ledger.has("stripe:evt_fail")).toBe(false);
  });

  it("payment money for a void invoice is not applied (flagged for refund, 200)", async () => {
    invoiceDoc.status = "void";
    const res = await post(stripeRequest(completed("evt_void")));
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("rejected:invoice_not_payable");
    expect(invoiceDoc.payments).toHaveLength(0);
  });

  it("failed renewal payment records the failure and marks the subscription past_due", async () => {
    invoiceFindByIdAndUpdate.mockReturnValue({
      lean: async () => ({ _id: INVOICE_ID, type: "renewal", subscriptionId: "sub1", invoiceNumber: "INV-1", activationPending: true }),
    });
    const res = await post(stripeRequest({
      id: "evt_f", type: "payment_intent.payment_failed",
      data: { object: { id: "pi_9", amount: 60000, currency: "aed", metadata: { invoiceId: INVOICE_ID }, last_payment_error: { decline_code: "card_declined" } } },
    }));
    expect((await res.json()).outcome).toBe("failed_past_due");
    expect(invoiceFindByIdAndUpdate).toHaveBeenCalledWith(
      INVOICE_ID,
      expect.objectContaining({ $push: expect.objectContaining({ gatewayFailures: expect.anything() }) }),
      expect.anything(),
    );
    expect(markSubscriptionPastDue).toHaveBeenCalledWith("sub1", expect.objectContaining({ invoiceNumber: "INV-1" }));
  });
});
