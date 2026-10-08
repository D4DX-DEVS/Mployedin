/**
 * @jest-environment node
 */
import crypto from "crypto";
import { StripeGateway, verifyStripeSignature } from "@/lib/payments/stripe";
import { WebhookSignatureError } from "@/lib/payments/types";

const SECRET = "whsec_test_secret_for_unit_tests";

function sign(body: string, t = Math.floor(Date.now() / 1000), secret = SECRET) {
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

function event(type: string, object: Record<string, unknown>, id = "evt_1") {
  return JSON.stringify({ id, type, data: { object } });
}

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_unit";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe("verifyStripeSignature", () => {
  const body = event("checkout.session.completed", { id: "cs_1" });

  it("accepts a valid signature", () => {
    expect(() => verifyStripeSignature(body, sign(body), SECRET)).not.toThrow();
  });

  it("accepts when any of several v1 signatures matches (secret rotation)", () => {
    const t = Math.floor(Date.now() / 1000);
    const good = sign(body, t).split(",")[1];
    expect(() => verifyStripeSignature(body, `t=${t},v1=${"0".repeat(64)},${good}`, SECRET)).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const header = sign(body);
    expect(() => verifyStripeSignature(body.replace("cs_1", "cs_2"), header, SECRET)).toThrow(WebhookSignatureError);
  });

  it("rejects a signature made with another secret", () => {
    expect(() => verifyStripeSignature(body, sign(body, undefined, "whsec_other"), SECRET)).toThrow(/mismatch/);
  });

  it("rejects an expired timestamp (> 5 min)", () => {
    const old = Math.floor(Date.now() / 1000) - 301;
    expect(() => verifyStripeSignature(body, sign(body, old), SECRET)).toThrow(/tolerance/);
  });

  it("rejects missing header / timestamp / secret", () => {
    expect(() => verifyStripeSignature(body, "", SECRET)).toThrow();
    expect(() => verifyStripeSignature(body, "v1=abc", SECRET)).toThrow(/timestamp/);
    expect(() => verifyStripeSignature(body, sign(body), "")).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});

describe("StripeGateway.verifyWebhook event mapping", () => {
  const gw = new StripeGateway();

  it("checkout.session.completed + paid → payment.success with invoice metadata", async () => {
    const body = event("checkout.session.completed", {
      id: "cs_1",
      payment_status: "paid",
      payment_intent: "pi_1",
      amount_total: 19900,
      currency: "aed",
      client_reference_id: "507f1f77bcf86cd799439011",
      metadata: { purpose: "subscription_change" },
      payment_method_types: ["card"],
    });
    const ev = await gw.verifyWebhook(body, sign(body));
    expect(ev).toMatchObject({
      eventId: "evt_1",
      eventType: "payment.success",
      paymentId: "pi_1",
      sessionId: "cs_1",
      amount: 199,
      currency: "AED",
      method: "card",
      metadata: { invoiceId: "507f1f77bcf86cd799439011", purpose: "subscription_change" },
    });
  });

  it("checkout.session.completed but unpaid (async method) → ignored", async () => {
    const body = event("checkout.session.completed", { id: "cs_1", payment_status: "unpaid", currency: "aed" });
    expect((await gw.verifyWebhook(body, sign(body))).eventType).toBe("ignored");
  });

  it("async_payment_succeeded → success, async_payment_failed → failed", async () => {
    const ok = event("checkout.session.async_payment_succeeded", { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", amount_total: 100, currency: "aed" });
    const bad = event("checkout.session.async_payment_failed", { id: "cs_1", payment_status: "unpaid", payment_intent: "pi_1", amount_total: 100, currency: "aed" });
    expect((await gw.verifyWebhook(ok, sign(ok))).eventType).toBe("payment.success");
    expect((await gw.verifyWebhook(bad, sign(bad))).eventType).toBe("payment.failed");
  });

  it("payment_intent.payment_failed → failed with decline code only", async () => {
    const body = event("payment_intent.payment_failed", {
      id: "pi_1", amount: 1000, currency: "aed", metadata: { invoiceId: "x" },
      last_payment_error: { decline_code: "insufficient_funds", message: "Your card has insufficient funds." },
    });
    const ev = await gw.verifyWebhook(body, sign(body));
    expect(ev.eventType).toBe("payment.failed");
    expect(ev.failureReason).toBe("insufficient_funds");
  });

  it("charge.refunded → refunded with cumulative amount + full flag", async () => {
    const partial = event("charge.refunded", { id: "ch_1", payment_intent: "pi_1", amount: 10000, amount_refunded: 2500, refunded: false, currency: "aed" });
    const full = event("charge.refunded", { id: "ch_1", payment_intent: "pi_1", amount: 10000, amount_refunded: 10000, refunded: true, currency: "aed" }, "evt_2");
    const p = await gw.verifyWebhook(partial, sign(partial));
    const f = await gw.verifyWebhook(full, sign(full));
    expect(p).toMatchObject({ eventType: "payment.refunded", paymentId: "pi_1", refund: { cumulativeAmount: 25, full: false } });
    expect(f.refund).toEqual({ cumulativeAmount: 100, full: true });
  });

  it("unhandled events → ignored", async () => {
    const body = event("customer.created", { id: "cus_1" });
    expect((await gw.verifyWebhook(body, sign(body))).eventType).toBe("ignored");
  });

  it("bad signature → throws", async () => {
    const body = event("checkout.session.completed", { id: "cs_1" });
    await expect(gw.verifyWebhook(body, "t=1,v1=deadbeef")).rejects.toThrow(WebhookSignatureError);
  });
});

describe("StripeGateway.createSession", () => {
  it("posts a form-encoded Checkout Session with minor units, metadata and idempotency key", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", expires_at: 1_900_000_000 }),
    });
    const gw = new StripeGateway();
    const session = await gw.createSession({
      invoiceId: "inv1", employerId: "emp1", amount: 12.34, currency: "KWD",
      description: "Invoice INV-1", customerEmail: "a@b.co", customerName: "Acme",
      successUrl: "https://app.test/en/employer/invoices?checkout=success", cancelUrl: "https://app.test/cancel",
      subscriptionId: "sub1", purpose: "subscription_change", attempt: 3,
    });

    expect(session).toMatchObject({ sessionId: "cs_test_1", provider: "stripe", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.headers.Authorization).toBe("Bearer sk_test_unit");
    expect(init.headers["Idempotency-Key"]).toBe("checkout-inv1-3");
    const form = new URLSearchParams(init.body);
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][currency]")).toBe("kwd");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("12340");
    expect(form.get("client_reference_id")).toBe("inv1");
    expect(form.get("metadata[invoiceId]")).toBe("inv1");
    expect(form.get("metadata[subscriptionId]")).toBe("sub1");
    expect(form.get("payment_intent_data[metadata][invoiceId]")).toBe("inv1");
    expect(form.get("success_url")).toBe("https://app.test/en/employer/invoices?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect(form.get("customer_email")).toBe("a@b.co");
    const expiresAt = Number(form.get("expires_at"));
    expect(expiresAt - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(30 * 60);
  });

  it("surfaces provider errors without leaking the key", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, statusText: "Bad", json: async () => ({ error: { message: "Invalid currency", code: "invalid_currency" } }) });
    const err = await new StripeGateway().createSession({
      invoiceId: "inv1", employerId: "e", amount: 10, currency: "AED", description: "x",
      customerEmail: "", customerName: "", successUrl: "https://a/s", cancelUrl: "https://a/c",
    }).catch((e: Error) => e);
    expect(String(err)).toMatch(/Invalid currency/);
    expect(String(err)).not.toMatch(/sk_test_unit/);
  });
});

describe("StripeGateway.verifyPayment", () => {
  it("returns paid with amounts from the provider", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "cs_test_1", status: "complete", payment_status: "paid", amount_total: 50000, currency: "inr",
        client_reference_id: "inv9", payment_intent: { id: "pi_9", payment_method_types: ["card"] },
      }),
    });
    const res = await new StripeGateway().verifyPayment("cs_test_1");
    expect(fetchMock.mock.calls[0][0]).toContain("/checkout/sessions/cs_test_1?expand[]=payment_intent");
    expect(res).toMatchObject({ verified: true, status: "paid", paymentId: "pi_9", invoiceId: "inv9", amount: 500, currency: "INR", method: "card" });
  });

  it("maps expired / open sessions", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "cs_a", status: "expired", payment_status: "unpaid", currency: "aed" }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "cs_b", status: "open", payment_status: "unpaid", currency: "aed" }) });
    expect((await new StripeGateway().verifyPayment("cs_a")).status).toBe("expired");
    expect((await new StripeGateway().verifyPayment("cs_b")).status).toBe("open");
  });

  it("rejects malformed session ids without calling Stripe", async () => {
    const res = await new StripeGateway().verifyPayment("../../v1/charges");
    expect(res.verified).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
