/**
 * @jest-environment node
 */
import crypto from "crypto";
import {
  RazorpayGateway,
  verifyRazorpayWebhookSignature,
  verifyRazorpayCallbackSignature,
} from "@/lib/payments/razorpay";
import { WebhookSignatureError } from "@/lib/payments/types";

const WEBHOOK_SECRET = "rzp_webhook_secret_unit";
const KEY_SECRET = "rzp_key_secret_unit";

const hmac = (secret: string, payload: string) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe("Razorpay webhook signature", () => {
  const body = JSON.stringify({ event: "payment_link.paid", payload: {} });

  it("accepts a valid X-Razorpay-Signature", () => {
    expect(() => verifyRazorpayWebhookSignature(body, hmac(WEBHOOK_SECRET, body), WEBHOOK_SECRET)).not.toThrow();
  });

  it("rejects tampered bodies, wrong secrets and missing headers", () => {
    const sig = hmac(WEBHOOK_SECRET, body);
    expect(() => verifyRazorpayWebhookSignature(body + " ", sig, WEBHOOK_SECRET)).toThrow(WebhookSignatureError);
    expect(() => verifyRazorpayWebhookSignature(body, hmac("other", body), WEBHOOK_SECRET)).toThrow(WebhookSignatureError);
    expect(() => verifyRazorpayWebhookSignature(body, "", WEBHOOK_SECRET)).toThrow(WebhookSignatureError);
    expect(() => verifyRazorpayWebhookSignature(body, sig, "")).toThrow(/RAZORPAY_WEBHOOK_SECRET/);
  });
});

describe("Razorpay callback signature", () => {
  const params = {
    razorpay_payment_link_id: "plink_ABC",
    razorpay_payment_link_reference_id: "507f1f77bcf86cd799439011",
    razorpay_payment_link_status: "paid",
    razorpay_payment_id: "pay_XYZ",
  };
  const good = hmac(KEY_SECRET, "plink_ABC|507f1f77bcf86cd799439011|paid|pay_XYZ");

  it("verifies link_id|reference_id|status|payment_id with key_secret", () => {
    expect(verifyRazorpayCallbackSignature({ ...params, razorpay_signature: good }, KEY_SECRET)).toBe(true);
  });

  it("fails when any part is changed", () => {
    expect(verifyRazorpayCallbackSignature({ ...params, razorpay_payment_link_status: "partially_paid", razorpay_signature: good }, KEY_SECRET)).toBe(false);
    expect(verifyRazorpayCallbackSignature({ ...params, razorpay_signature: "00" }, KEY_SECRET)).toBe(false);
  });
});

describe("RazorpayGateway.verifyWebhook mapping", () => {
  const gw = new RazorpayGateway();
  const signed = (obj: unknown) => {
    const body = JSON.stringify(obj);
    return [body, hmac(WEBHOOK_SECRET, body)] as const;
  };

  it("payment_link.paid → success with notes + event id header", async () => {
    const [body, sig] = signed({
      event: "payment_link.paid",
      payload: {
        payment_link: { entity: { id: "plink_1", amount_paid: 49900, currency: "INR", notes: { invoiceId: "inv1", purpose: "invoice" } } },
        payment: { entity: { id: "pay_1", amount: 49900, currency: "INR", method: "upi" } },
      },
    });
    const ev = await gw.verifyWebhook(body, sig, { eventId: "evt_rzp_1" });
    expect(ev).toMatchObject({
      eventId: "evt_rzp_1", eventType: "payment.success", paymentId: "pay_1", sessionId: "plink_1",
      amount: 499, currency: "INR", method: "upi", metadata: { invoiceId: "inv1" },
    });
  });

  it("falls back to a body hash when the event id header is missing", async () => {
    const [body, sig] = signed({ event: "payment.failed", payload: { payment: { entity: { id: "pay_2", amount: 100, currency: "INR", error_reason: "payment_failed" } } } });
    const ev = await gw.verifyWebhook(body, sig);
    expect(ev.eventId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ev.eventType).toBe("payment.failed");
  });

  it("refund.processed → refunded with per-refund + cumulative amounts", async () => {
    const [body, sig] = signed({
      event: "refund.processed",
      payload: {
        refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 10000, currency: "INR" } },
        payment: { entity: { id: "pay_1", amount: 49900, amount_refunded: 10000, refund_status: "partial", currency: "INR" } },
      },
    });
    const ev = await gw.verifyWebhook(body, sig, { eventId: "e" });
    expect(ev).toMatchObject({ eventType: "payment.refunded", paymentId: "pay_1", refund: { refundId: "rfnd_1", amount: 100, cumulativeAmount: 100, full: false } });
  });

  it("other events → ignored", async () => {
    const [body, sig] = signed({ event: "order.paid", payload: {} });
    expect((await gw.verifyWebhook(body, sig, { eventId: "e" })).eventType).toBe("ignored");
  });
});

describe("RazorpayGateway.createSession", () => {
  it("creates a payment link with Basic auth, minor units, reference and callback", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "plink_1", short_url: "https://rzp.io/i/abc", expire_by: 1_900_000_000 }) });
    const session = await new RazorpayGateway().createSession({
      invoiceId: "507f1f77bcf86cd799439011", employerId: "emp1", amount: 499, currency: "INR",
      description: "Invoice INV-1", customerEmail: "a@b.co", customerName: "Acme",
      successUrl: "https://app.test/en/employer/invoices?checkout=success&provider=razorpay", cancelUrl: "https://app.test/c",
      attempt: 2,
    });
    expect(session).toMatchObject({ sessionId: "plink_1", checkoutUrl: "https://rzp.io/i/abc", provider: "razorpay" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/payment_links");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`rzp_test_unit:${KEY_SECRET}`).toString("base64")}`);
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      amount: 49900, currency: "INR", reference_id: "507f1f77bcf86cd799439011-2",
      callback_method: "get", callback_url: "https://app.test/en/employer/invoices?checkout=success&provider=razorpay",
      notes: { invoiceId: "507f1f77bcf86cd799439011", employerId: "emp1" },
    });
    expect(payload.expire_by - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(29 * 60);
  });
});

describe("RazorpayGateway.verifyPayment", () => {
  const params = {
    razorpay_payment_link_id: "plink_1",
    razorpay_payment_link_reference_id: "inv1",
    razorpay_payment_link_status: "paid",
    razorpay_payment_id: "pay_1",
  };

  it("rejects a forged callback without calling the API", async () => {
    const res = await new RazorpayGateway().verifyPayment("plink_1", { ...params, razorpay_signature: "bad" });
    expect(res).toMatchObject({ verified: false, error: "invalid_signature" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirms a paid link from the API", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "plink_1", status: "paid", currency: "INR", amount_paid: 49900, notes: { invoiceId: "inv1" },
        payments: [{ payment_id: "pay_1", amount: 49900, status: "captured", method: "card" }],
      }),
    });
    const sig = hmac(KEY_SECRET, "plink_1|inv1|paid|pay_1");
    const res = await new RazorpayGateway().verifyPayment("plink_1", { ...params, razorpay_signature: sig });
    expect(res).toMatchObject({ verified: true, status: "paid", paymentId: "pay_1", invoiceId: "inv1", amount: 499, currency: "INR", method: "card" });
  });
});
