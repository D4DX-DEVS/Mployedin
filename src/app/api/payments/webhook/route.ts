/**
 * POST /api/payments/webhook — Payment gateway webhook (Stripe / Razorpay).
 *
 * Auth = provider signature over the RAW body (read with req.text() before any
 * parsing), NOT withAuth — gateways can't log in. CSRF-exempt (exact path, see
 * lib/security/csrf.ts).
 *
 * Provider: `Stripe-Signature` header → Stripe, `X-Razorpay-Signature` →
 * Razorpay, or `?provider=stripe|razorpay` explicitly.
 *
 * Idempotency: every verified event is first INSERTED into PaymentEvent
 * (unique provider+eventId). A duplicate delivery hits E11000 and is
 * acknowledged without reprocessing; a processing failure deletes the row and
 * answers 500 so the provider retries.
 *
 *   payment.success  → markInvoicePaid (shared with manual verification):
 *                      records the payment, approves commissions, activates /
 *                      renews the subscription only now.
 *   payment.failed   → failed attempt recorded; renewal invoice → subscription past_due.
 *   payment.refunded → credit note + commission clawback.
 *   anything else    → 200, ignored.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { getGatewayFor, getActiveProvider } from "@/lib/payments";
import { markInvoicePaid } from "@/lib/payments/markInvoicePaid";
import { applyGatewayRefund } from "@/lib/payments/refunds";
import { markSubscriptionPastDue } from "@/lib/payments/subscriptionFulfillment";
import { fulfillSubscriptionPurchase } from "@/lib/subscription/fulfillPurchase";
import { logActivity } from "@/lib/audit/log";
import Invoice from "@/models/Invoice";
import PaymentEvent from "@/models/PaymentEvent";
import logger from "@/lib/logger";
import type { PaymentWebhookEvent } from "@/lib/payments/types";

type Provider = "stripe" | "razorpay";

function detectProvider(req: NextRequest): { provider: Provider; signature: string } | null {
  const explicit = req.nextUrl.searchParams.get("provider");
  const stripeSig = req.headers.get("stripe-signature");
  const razorpaySig = req.headers.get("x-razorpay-signature");
  if (explicit === "stripe") return { provider: "stripe", signature: stripeSig ?? "" };
  if (explicit === "razorpay") return { provider: "razorpay", signature: razorpaySig ?? "" };
  if (stripeSig) return { provider: "stripe", signature: stripeSig };
  if (razorpaySig) return { provider: "razorpay", signature: razorpaySig };
  return null;
}

function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: number }).code === 11000);
}

async function resolveInvoiceId(event: PaymentWebhookEvent): Promise<string | null> {
  const fromMeta = event.metadata?.invoiceId;
  if (fromMeta && /^[a-f\d]{24}$/i.test(fromMeta)) return fromMeta;
  if (event.sessionId) {
    const bySession = await Invoice.findOne({ "gatewaySession.sessionId": event.sessionId }).select("_id").lean<{ _id: unknown } | null>();
    if (bySession) return String(bySession._id);
  }
  if (event.paymentId) {
    const byPayment = await Invoice.findOne({ "payments.referenceNumber": event.paymentId }).select("_id").lean<{ _id: unknown } | null>();
    if (byPayment) return String(byPayment._id);
  }
  return null;
}

async function handleSuccess(event: PaymentWebhookEvent): Promise<Record<string, unknown>> {
  const invoiceId = await resolveInvoiceId(event);

  if (!invoiceId) {
    // Legacy checkout sessions (created before invoice-first checkout) carried
    // {userId, planId} only.
    const { userId, planId } = event.metadata ?? {};
    if (userId && planId) {
      const result = await fulfillSubscriptionPurchase({
        userId,
        planId,
        paymentId: event.paymentId,
        provider: event.provider,
        amount: event.amount,
        currency: event.currency,
        method: event.method,
      });
      if (result.status === "error") throw new Error(result.error);
      return { outcome: `legacy_${result.status}` };
    }
    logger.error({ provider: event.provider, paymentId: event.paymentId, sessionId: event.sessionId }, "Gateway payment with no matching invoice");
    return { outcome: "invoice_not_found" };
  }

  const result = await markInvoicePaid(invoiceId, {
    provider: event.provider,
    paymentId: event.paymentId,
    amount: event.amount,
    currency: event.currency,
    method: event.method,
  });

  if (result.status === "conflict") throw new Error("Invoice kept changing while recording payment");

  if (result.status === "rejected" || result.status === "not_found") {
    // Money was captured but can't be applied (void invoice, double payment,
    // wrong currency/amount). Retrying won't help — flag it for a manual refund.
    logger.error(
      { invoiceId, provider: event.provider, paymentId: event.paymentId, reason: result.reason ?? result.status },
      "Gateway payment could not be applied to invoice — manual review / refund needed",
    );
    await logActivity({
      actorRole: "system",
      action: "invoice.gateway_payment_rejected",
      resource: "invoices",
      resourceId: invoiceId,
      meta: {
        provider: event.provider,
        paymentId: event.paymentId,
        amount: event.amount,
        currency: event.currency,
        reason: result.reason ?? result.status,
      },
    });
  }

  return { outcome: result.reason ? `${result.status}:${result.reason}` : result.status, invoiceId };
}

async function handleFailure(event: PaymentWebhookEvent): Promise<Record<string, unknown>> {
  const invoiceId = await resolveInvoiceId(event);
  if (!invoiceId) return { outcome: "invoice_not_found" };

  const invoice = await Invoice.findByIdAndUpdate(
    invoiceId,
    {
      $push: {
        gatewayFailures: {
          $each: [{ provider: event.provider, paymentId: event.paymentId, reason: event.failureReason, at: new Date() }],
          $slice: -20,
        },
      },
    },
    { returnDocument: "after" },
  ).lean<{ _id: unknown; type?: string; subscriptionId?: unknown; invoiceNumber?: string; activationPending?: boolean } | null>();
  if (!invoice) return { outcome: "invoice_not_found" };

  await logActivity({
    actorRole: "system",
    action: "invoice.gateway_payment_failed",
    resource: "invoices",
    resourceId: invoiceId,
    meta: { provider: event.provider, paymentId: event.paymentId, reason: event.failureReason },
  });

  let pastDue = false;
  if (invoice.type === "renewal" && invoice.subscriptionId && invoice.activationPending) {
    pastDue = await markSubscriptionPastDue(invoice.subscriptionId, {
      reason: `Renewal payment failed (${event.provider}: ${event.failureReason ?? "declined"})`,
      invoiceNumber: invoice.invoiceNumber,
    });
  }
  return { outcome: pastDue ? "failed_past_due" : "failed_recorded", invoiceId };
}

export async function POST(req: NextRequest) {
  const detected = detectProvider(req);
  if (!detected) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
  }
  // Only the configured provider may post events.
  if (getActiveProvider() !== detected.provider) {
    return NextResponse.json({ error: "payment_gateway_not_configured" }, { status: 503 });
  }

  // Raw body first — the signature covers the exact bytes.
  const rawBody = await req.text();

  let event: PaymentWebhookEvent;
  try {
    event = await getGatewayFor(detected.provider).verifyWebhook(rawBody, detected.signature, {
      eventId: req.headers.get("x-razorpay-event-id"),
    });
  } catch (err) {
    logger.warn({ provider: detected.provider, reason: err instanceof Error ? err.message : "unknown" }, "Payment webhook signature verification failed");
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.eventType === "ignored") {
    return NextResponse.json({ received: true, ignored: event.providerEventType });
  }
  if (!event.eventId) {
    return NextResponse.json({ received: true, ignored: "missing_event_id" });
  }

  await connectDB();

  // Atomic claim of the event id.
  try {
    await PaymentEvent.create({
      provider: event.provider,
      eventId: event.eventId,
      eventType: event.eventType,
      providerEventType: event.providerEventType,
      status: "processing",
      paymentId: event.paymentId || undefined,
      sessionId: event.sessionId || undefined,
      amount: event.amount,
      currency: event.currency || undefined,
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw err;
  }

  try {
    let result: Record<string, unknown>;
    if (event.eventType === "payment.success") {
      result = await handleSuccess(event);
    } else if (event.eventType === "payment.failed") {
      result = await handleFailure(event);
    } else {
      const refund = await applyGatewayRefund(event);
      result = { outcome: refund.status, invoiceId: refund.invoiceId, creditNoteNumber: refund.creditNoteNumber };
    }

    await PaymentEvent.updateOne(
      { provider: event.provider, eventId: event.eventId },
      {
        $set: {
          status: "processed",
          processedAt: new Date(),
          outcome: String(result.outcome ?? "").slice(0, 200),
          ...(typeof result.invoiceId === "string" && /^[a-f\d]{24}$/i.test(result.invoiceId) ? { invoiceId: result.invoiceId } : {}),
        },
      },
    );

    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    // Release the claim so the provider's retry can process it.
    await PaymentEvent.deleteOne({ provider: event.provider, eventId: event.eventId }).catch(() => undefined);
    logger.error({ err, provider: event.provider, eventId: event.eventId, paymentId: event.paymentId }, "Payment webhook processing failed");
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
