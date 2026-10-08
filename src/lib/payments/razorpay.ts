/**
 * Razorpay payment gateway adapter — REST API via fetch (no SDK dependency).
 *
 * Env: RAZORPAY_KEY_ID (rzp_test_… / rzp_live_…), RAZORPAY_KEY_SECRET,
 *      RAZORPAY_WEBHOOK_SECRET, NEXT_PUBLIC_RAZORPAY_KEY_ID (admin status only).
 *
 * Uses hosted Payment Links (short_url) rather than the Checkout.js modal, so no
 * client SDK and no CSP changes are needed. Razorpay redirects back to
 * callback_url with signed query params, verified in verifyPayment().
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
  safeEqual,
  hmacSha256Hex,
  sha256Hex,
  cleanMetadata,
  isPlausibleEmail,
  PROVIDER_TIMEOUT_MS,
} from "./http";

const RAZORPAY_API = "https://api.razorpay.com/v1";
const LINK_TTL_SEC = 30 * 60;

type RzpObject = Record<string, unknown>;

function credentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new PaymentProviderError("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set", 503, "not_configured");
  }
  return { keyId, keySecret };
}

async function razorpayRequest<T = RzpObject>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { keyId, keySecret } = credentials();
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
  };
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as RzpObject;
  if (!res.ok) {
    const err = (json.error ?? {}) as { description?: string; code?: string };
    throw new PaymentProviderError(
      `Razorpay ${method} ${path} failed: ${err.description ?? res.statusText}`,
      res.status,
      err.code,
    );
  }
  return json as T;
}

// ── Signatures ───────────────────────────────────────────────────────────────

/** `X-Razorpay-Signature` = hex HMAC-SHA256(rawBody, webhook secret). */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string, secret: string): void {
  if (!secret) throw new WebhookSignatureError("RAZORPAY_WEBHOOK_SECRET is not set");
  if (!signature) throw new WebhookSignatureError("Missing X-Razorpay-Signature header");
  if (!safeEqual(signature, hmacSha256Hex(secret, rawBody))) {
    throw new WebhookSignatureError("Razorpay signature mismatch");
  }
}

/**
 * Payment-link callback signature:
 * HMAC-SHA256(`${link_id}|${reference_id}|${status}|${payment_id}`, key_secret).
 */
export function verifyRazorpayCallbackSignature(
  params: Record<string, string>,
  keySecret: string,
): boolean {
  const payload = [
    params.razorpay_payment_link_id ?? "",
    params.razorpay_payment_link_reference_id ?? "",
    params.razorpay_payment_link_status ?? "",
    params.razorpay_payment_id ?? "",
  ].join("|");
  return safeEqual(params.razorpay_signature ?? "", hmacSha256Hex(keySecret, payload));
}

// ── Mapping ──────────────────────────────────────────────────────────────────

function mapMethod(method: unknown): PaymentMethodType {
  switch (method) {
    case "card":
    case "emi":
      return "card";
    case "upi":
      return "upi";
    case "netbanking":
      return "netbanking";
    case "wallet":
      return "wallet";
    case "bank_transfer":
      return "bank_transfer";
    default:
      return "other";
  }
}

function entity(payload: RzpObject, key: string): RzpObject {
  const wrapper = payload[key] as RzpObject | undefined;
  return ((wrapper?.entity as RzpObject | undefined) ?? {}) as RzpObject;
}

function notesOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as RzpObject)) {
    if (v !== undefined && v !== null) out[k] = String(v);
  }
  return out;
}

function linkStatus(status: unknown): VerifiedPaymentStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "partially_paid":
      return "pending";
    case "expired":
    case "cancelled":
      return "expired";
    default:
      return "open";
  }
}

// ── Gateway ──────────────────────────────────────────────────────────────────

export class RazorpayGateway implements PaymentGateway {
  provider = "razorpay" as const;

  async createSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
    const currency = input.currency.toUpperCase();
    const amount = toMinorUnits(input.amount, currency);
    if (amount <= 0) throw new PaymentProviderError("Amount must be greater than zero", 400, "invalid_amount");

    const attempt = input.attempt ?? 1;
    // reference_id must be unique across payment links, so retries for the
    // same invoice carry an attempt suffix. Max 40 chars (ObjectId is 24).
    const referenceId = attempt > 1 ? `${input.invoiceId}-${attempt}` : input.invoiceId;
    const expireBy = Math.floor(Date.now() / 1000) + LINK_TTL_SEC;

    const notes = cleanMetadata({
      invoiceId: input.invoiceId,
      employerId: input.employerId,
      subscriptionId: input.subscriptionId,
      purpose: input.purpose ?? "invoice",
      ...(input.metadata ?? {}),
    });

    const link = await razorpayRequest<RzpObject>("POST", "/payment_links", {
      amount,
      currency,
      accept_partial: false,
      reference_id: referenceId,
      description: input.description.slice(0, 2048),
      customer: {
        name: input.customerName?.slice(0, 100) || undefined,
        email: isPlausibleEmail(input.customerEmail) ? input.customerEmail : undefined,
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes,
      callback_url: input.successUrl,
      callback_method: "get",
      expire_by: expireBy,
    });

    const url = typeof link.short_url === "string" ? link.short_url : "";
    if (!url) throw new PaymentProviderError("Razorpay returned no payment link URL", 502, "no_url");

    return {
      sessionId: String(link.id),
      provider: "razorpay",
      checkoutUrl: url,
      amount: input.amount,
      currency,
      status: "created",
      expiresAt: new Date(Number(link.expire_by ?? expireBy) * 1000),
    };
  }

  async verifyWebhook(rawBody: string, signature: string, headers?: WebhookHeaders): Promise<PaymentWebhookEvent> {
    verifyRazorpayWebhookSignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET ?? "");

    let event: RzpObject;
    try {
      event = JSON.parse(rawBody) as RzpObject;
    } catch {
      throw new WebhookSignatureError("Razorpay webhook body is not JSON");
    }

    const type = String(event.event ?? "");
    const payload = (event.payload ?? {}) as RzpObject;
    const payment = entity(payload, "payment");
    const base = {
      provider: "razorpay" as const,
      // Razorpay's per-event id header; the body hash is a stable fallback.
      eventId: headers?.eventId || `sha256:${sha256Hex(rawBody)}`,
      providerEventType: type,
      rawPayload: event,
    };

    if (type === "payment_link.paid") {
      const link = entity(payload, "payment_link");
      const currency = String(payment.currency ?? link.currency ?? "").toUpperCase();
      const notes = notesOf(link.notes);
      return {
        ...base,
        eventType: "payment.success",
        paymentId: String(payment.id ?? ""),
        sessionId: String(link.id ?? ""),
        amount: fromMinorUnits(Number(payment.amount ?? link.amount_paid ?? 0), currency),
        currency,
        method: mapMethod(payment.method),
        metadata: { ...notesOf(payment.notes), ...notes },
      };
    }

    if (type === "payment.failed") {
      const currency = String(payment.currency ?? "").toUpperCase();
      return {
        ...base,
        eventType: "payment.failed",
        paymentId: String(payment.id ?? ""),
        sessionId: "",
        amount: fromMinorUnits(Number(payment.amount ?? 0), currency),
        currency,
        method: mapMethod(payment.method),
        metadata: notesOf(payment.notes),
        failureReason: String(payment.error_reason ?? payment.error_code ?? "payment_failed").slice(0, 200),
      };
    }

    if (type === "refund.processed" || type === "payment.refunded") {
      const refund = entity(payload, "refund");
      const currency = String(refund.currency ?? payment.currency ?? "").toUpperCase();
      const paymentAmount = Number(payment.amount ?? 0);
      const cumulative = payment.amount_refunded !== undefined ? Number(payment.amount_refunded) : undefined;
      const thisRefund = refund.amount !== undefined ? Number(refund.amount) : undefined;
      return {
        ...base,
        eventType: "payment.refunded",
        paymentId: String(refund.payment_id ?? payment.id ?? ""),
        sessionId: "",
        amount: fromMinorUnits(thisRefund ?? cumulative ?? 0, currency),
        currency,
        metadata: { ...notesOf(payment.notes), ...notesOf(refund.notes) },
        refund: {
          refundId: refund.id ? String(refund.id) : undefined,
          amount: thisRefund !== undefined ? fromMinorUnits(thisRefund, currency) : undefined,
          cumulativeAmount: cumulative !== undefined ? fromMinorUnits(cumulative, currency) : undefined,
          full:
            payment.refund_status === "full" ||
            (paymentAmount > 0 && cumulative !== undefined && cumulative >= paymentAmount),
        },
      };
    }

    return { ...base, eventType: "ignored", paymentId: "", sessionId: "", amount: 0, currency: "" };
  }

  async verifyPayment(sessionId: string, callbackParams?: Record<string, string>): Promise<VerifyPaymentResult> {
    const fail = (error: string): VerifyPaymentResult => ({
      verified: false, status: "failed", paymentId: "", sessionId, amount: 0, currency: "",
      method: "other", providerReference: sessionId, error,
    });

    if (!/^plink_[A-Za-z0-9]+$/.test(sessionId)) return fail("invalid_session_id");

    // The redirect is signed with key_secret; a tampered query is rejected
    // before we even ask the API. The API read below is the source of truth.
    if (callbackParams?.razorpay_signature) {
      const { keySecret } = credentials();
      if (!verifyRazorpayCallbackSignature(callbackParams, keySecret)) return fail("invalid_signature");
    }

    const link = await razorpayRequest<RzpObject>("GET", `/payment_links/${encodeURIComponent(sessionId)}`);
    const currency = String(link.currency ?? "").toUpperCase();
    const payments = (Array.isArray(link.payments) ? link.payments : []) as RzpObject[];
    const captured = payments.find((p) => p.status === "captured");
    const status = linkStatus(link.status);
    const notes = notesOf(link.notes);

    return {
      verified: status === "paid" && Boolean(captured),
      status: status === "paid" && !captured ? "pending" : status,
      paymentId: String(captured?.payment_id ?? callbackParams?.razorpay_payment_id ?? ""),
      sessionId: String(link.id ?? sessionId),
      invoiceId: notes.invoiceId || undefined,
      amount: fromMinorUnits(Number(captured?.amount ?? link.amount_paid ?? 0), currency),
      currency,
      method: mapMethod(captured?.method),
      providerReference: String(link.id ?? sessionId),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const currency = (input.currency ?? process.env.DEFAULT_CURRENCY ?? "INR").toUpperCase();
    const refund = await razorpayRequest<RzpObject>(
      "POST",
      `/payments/${encodeURIComponent(input.paymentId)}/refund`,
      {
        amount: toMinorUnits(input.amount, currency),
        notes: { reason: input.reason.slice(0, 250) },
      },
    );
    const status = refund.status === "processed" ? "processed" : refund.status === "failed" ? "failed" : "pending";
    return {
      refundId: String(refund.id),
      amount: fromMinorUnits(Number(refund.amount ?? 0), currency),
      status,
    };
  }
}
