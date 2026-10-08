/**
 * Stripe payment gateway adapter — REST API via fetch (no SDK dependency).
 *
 * Env: STRIPE_SECRET_KEY (sk_test_… / sk_live_…), STRIPE_WEBHOOK_SECRET (whsec_…),
 *      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_… — only shown in admin status).
 *
 * Flow: hosted Checkout Session (mode=payment) → redirect → webhook
 * (checkout.session.completed / async_payment_*) + return-page confirmation via
 * GET /v1/checkout/sessions/:id.
 */

import type {
  PaymentGateway,
  CreatePaymentSessionInput,
  PaymentSession,
  PaymentWebhookEvent,
  VerifyPaymentResult,
  VerifiedPaymentStatus,
  RefundInput,
  RefundResult,
  PaymentMethodType,
  WebhookHeaders,
} from "./types";
import { PaymentProviderError, WebhookSignatureError } from "./types";
import { toMinorUnits, fromMinorUnits } from "./currency";
import {
  toFormBody,
  safeEqual,
  hmacSha256Hex,
  cleanMetadata,
  isPlausibleEmail,
  PROVIDER_TIMEOUT_MS,
} from "./http";

const STRIPE_API = "https://api.stripe.com/v1";

/** Stripe's own default tolerance for webhook timestamps. */
export const STRIPE_SIGNATURE_TOLERANCE_SEC = 300;

/**
 * Checkout Sessions must live at least 30 minutes; a one-minute buffer keeps
 * clock skew between us and Stripe from tripping that minimum.
 */
const SESSION_TTL_SEC = 30 * 60 + 60;

/** Stripe Checkout supports these UI locales among ours. */
const STRIPE_LOCALES = new Set(["en", "ar"]);

type StripeObject = Record<string, unknown>;

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new PaymentProviderError("STRIPE_SECRET_KEY is not set", 503, "not_configured");
  return key;
}

async function stripeRequest<T = StripeObject>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
  };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: body ? toFormBody(body) : undefined,
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  const json = (await res.json().catch(() => ({}))) as StripeObject;
  if (!res.ok) {
    const err = (json.error ?? {}) as { message?: string; code?: string; type?: string };
    throw new PaymentProviderError(
      `Stripe ${method} ${path.split("?")[0]} failed: ${err.message ?? res.statusText}`,
      res.status,
      err.code ?? err.type,
    );
  }
  return json as T;
}

// ── Signature verification ───────────────────────────────────────────────────

/**
 * Verify a `Stripe-Signature` header: `t=<unix>,v1=<hex>[,v1=<hex>…]`.
 * Signed payload = `${t}.${rawBody}`, HMAC-SHA256 with the endpoint secret.
 * Throws WebhookSignatureError; returns the parsed timestamp on success.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string,
  secret: string,
  toleranceSec = STRIPE_SIGNATURE_TOLERANCE_SEC,
  nowSec = Math.floor(Date.now() / 1000),
): number {
  if (!secret) throw new WebhookSignatureError("STRIPE_WEBHOOK_SECRET is not set");
  if (!header) throw new WebhookSignatureError("Missing Stripe-Signature header");

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") timestamp = Number(v);
    else if (k === "v1") signatures.push(v);
  }

  if (timestamp === null || !Number.isFinite(timestamp)) {
    throw new WebhookSignatureError("Stripe-Signature has no timestamp");
  }
  if (signatures.length === 0) {
    throw new WebhookSignatureError("Stripe-Signature has no v1 signature");
  }

  const expected = hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!signatures.some((sig) => safeEqual(sig, expected))) {
    throw new WebhookSignatureError("Stripe signature mismatch");
  }
  if (Math.abs(nowSec - timestamp) > toleranceSec) {
    throw new WebhookSignatureError("Stripe signature timestamp outside tolerance");
  }
  return timestamp;
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

function mapMethod(type: unknown): PaymentMethodType {
  switch (type) {
    case "card":
    case "link":
      return "card";
    case "customer_balance":
    case "us_bank_account":
    case "sepa_debit":
    case "bacs_debit":
    case "au_becs_debit":
      return "bank_transfer";
    default:
      return "other";
  }
}

function idOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in (value as StripeObject)) return String((value as StripeObject).id ?? "");
  return "";
}

function metadataOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as StripeObject)) {
    if (v !== undefined && v !== null) out[k] = String(v);
  }
  return out;
}

function sessionStatus(session: StripeObject): VerifiedPaymentStatus {
  const paymentStatus = session.payment_status;
  if (paymentStatus === "paid" || paymentStatus === "no_payment_required") return "paid";
  if (session.status === "expired") return "expired";
  if (session.status === "complete") return "pending"; // async method (bank debit) still settling
  const pi = session.payment_intent as StripeObject | undefined;
  if (pi && typeof pi === "object" && pi.last_payment_error) return "failed";
  return "open";
}

// ── Gateway ──────────────────────────────────────────────────────────────────

export class StripeGateway implements PaymentGateway {
  provider = "stripe" as const;

  async createSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
    const currency = input.currency.toUpperCase();
    const unitAmount = toMinorUnits(input.amount, currency);
    if (unitAmount <= 0) throw new PaymentProviderError("Amount must be greater than zero", 400, "invalid_amount");

    const metadata = cleanMetadata({
      invoiceId: input.invoiceId,
      employerId: input.employerId,
      subscriptionId: input.subscriptionId,
      purpose: input.purpose ?? "invoice",
      ...(input.metadata ?? {}),
    });

    const sep = input.successUrl.includes("?") ? "&" : "?";
    const successUrl = `${input.successUrl}${sep}session_id={CHECKOUT_SESSION_ID}`;
    const attempt = input.attempt ?? 1;
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;

    const session = await stripeRequest<StripeObject>(
      "POST",
      "/checkout/sessions",
      {
        mode: "payment",
        client_reference_id: input.invoiceId,
        customer_email: isPlausibleEmail(input.customerEmail) ? input.customerEmail : undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: unitAmount,
              product_data: { name: input.description.slice(0, 250) || "Invoice payment" },
            },
          },
        ],
        metadata,
        // Copied onto the PaymentIntent so payment_intent.* / charge.* events
        // (failures, refunds) can be traced back to the invoice too.
        payment_intent_data: { metadata, description: input.description.slice(0, 250) },
        success_url: successUrl,
        cancel_url: input.cancelUrl,
        expires_at: expiresAt,
        locale: input.locale && STRIPE_LOCALES.has(input.locale) ? input.locale : undefined,
      },
      `checkout-${input.invoiceId}-${attempt}`,
    );

    const url = typeof session.url === "string" ? session.url : "";
    if (!url) throw new PaymentProviderError("Stripe returned no checkout URL", 502, "no_url");

    return {
      sessionId: String(session.id),
      provider: "stripe",
      checkoutUrl: url,
      amount: input.amount,
      currency,
      status: "created",
      expiresAt: new Date(Number(session.expires_at ?? expiresAt) * 1000),
    };
  }

  async verifyWebhook(rawBody: string, signature: string, _headers?: WebhookHeaders): Promise<PaymentWebhookEvent> {
    void _headers;
    verifyStripeSignature(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET ?? "");

    let event: StripeObject;
    try {
      event = JSON.parse(rawBody) as StripeObject;
    } catch {
      throw new WebhookSignatureError("Stripe webhook body is not JSON");
    }

    const type = String(event.type ?? "");
    const obj = ((event.data as StripeObject | undefined)?.object ?? {}) as StripeObject;
    const base = {
      provider: "stripe" as const,
      eventId: String(event.id ?? ""),
      providerEventType: type,
      rawPayload: event,
    };

    const currency = String(obj.currency ?? "").toUpperCase();

    if (
      type === "checkout.session.completed" ||
      type === "checkout.session.async_payment_succeeded" ||
      type === "checkout.session.async_payment_failed"
    ) {
      const paid = obj.payment_status === "paid";
      const eventType =
        type === "checkout.session.async_payment_failed"
          ? "payment.failed"
          : paid
            ? "payment.success"
            : "ignored"; // completed but unpaid → async method, wait for async_payment_*
      return {
        ...base,
        eventType,
        paymentId: idOf(obj.payment_intent) || String(obj.id ?? ""),
        sessionId: String(obj.id ?? ""),
        amount: fromMinorUnits(Number(obj.amount_total ?? 0), currency),
        currency,
        method: mapMethod((obj.payment_method_types as string[] | undefined)?.[0]),
        metadata: { ...metadataOf(obj.metadata), ...(obj.client_reference_id ? { invoiceId: String(obj.client_reference_id) } : {}) },
      };
    }

    if (type === "payment_intent.payment_failed") {
      const lastError = (obj.last_payment_error ?? {}) as StripeObject;
      return {
        ...base,
        eventType: "payment.failed",
        paymentId: String(obj.id ?? ""),
        sessionId: "",
        amount: fromMinorUnits(Number(obj.amount ?? 0), currency),
        currency,
        metadata: metadataOf(obj.metadata),
        // Decline code / message only — never card data.
        failureReason: String(lastError.decline_code ?? lastError.code ?? lastError.message ?? "payment_failed").slice(0, 200),
      };
    }

    if (type === "charge.refunded") {
      const amount = Number(obj.amount ?? 0);
      const refunded = Number(obj.amount_refunded ?? 0);
      return {
        ...base,
        eventType: "payment.refunded",
        paymentId: idOf(obj.payment_intent) || String(obj.id ?? ""),
        sessionId: "",
        amount: fromMinorUnits(refunded, currency),
        currency,
        metadata: metadataOf(obj.metadata),
        refund: {
          cumulativeAmount: fromMinorUnits(refunded, currency),
          full: obj.refunded === true || (amount > 0 && refunded >= amount),
        },
      };
    }

    return { ...base, eventType: "ignored", paymentId: "", sessionId: "", amount: 0, currency };
  }

  async verifyPayment(sessionId: string, _callbackParams?: Record<string, string>): Promise<VerifyPaymentResult> {
    void _callbackParams;
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      return {
        verified: false, status: "failed", paymentId: "", sessionId, amount: 0, currency: "",
        method: "other", providerReference: sessionId, error: "invalid_session_id",
      };
    }

    const session = await stripeRequest<StripeObject>(
      "GET",
      `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`,
    );
    const currency = String(session.currency ?? "").toUpperCase();
    const status = sessionStatus(session);
    const pi = session.payment_intent as StripeObject | string | null;
    const piTypes = typeof pi === "object" && pi ? (pi.payment_method_types as string[] | undefined) : undefined;
    const metadata = metadataOf(session.metadata);

    return {
      verified: status === "paid",
      status,
      paymentId: idOf(pi) || String(session.id),
      sessionId: String(session.id),
      invoiceId: String(session.client_reference_id ?? metadata.invoiceId ?? "") || undefined,
      amount: fromMinorUnits(Number(session.amount_total ?? 0), currency),
      currency,
      method: mapMethod(piTypes?.[0] ?? (session.payment_method_types as string[] | undefined)?.[0]),
      providerReference: String(session.id),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const currency = (input.currency ?? process.env.DEFAULT_CURRENCY ?? "USD").toUpperCase();
    const refund = await stripeRequest<StripeObject>(
      "POST",
      "/refunds",
      {
        payment_intent: input.paymentId,
        amount: toMinorUnits(input.amount, currency),
        reason: "requested_by_customer",
        metadata: { reason: input.reason.slice(0, 250) },
      },
      `refund-${input.paymentId}-${toMinorUnits(input.amount, currency)}-${Date.now()}`,
    );
    const status = refund.status === "succeeded" ? "processed" : refund.status === "failed" ? "failed" : "pending";
    return {
      refundId: String(refund.id),
      amount: fromMinorUnits(Number(refund.amount ?? 0), currency),
      status,
    };
  }
}
