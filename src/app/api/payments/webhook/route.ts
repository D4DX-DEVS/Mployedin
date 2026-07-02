/**
 * POST /api/payments/webhook — Payment gateway webhook (Stripe / Razorpay).
 *
 * Auth = gateway signature verification, NOT withAuth (gateways can't login).
 * On payment.success → fulfillSubscriptionPurchase (idempotent, so gateway
 * retries are safe). Other events are acknowledged and ignored for now.
 *
 * Returns 503 until PAYMENT_PROVIDER + gateway keys are configured.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { getPaymentGateway, isPaymentGatewayEnabled } from "@/lib/payments";
import { fulfillSubscriptionPurchase } from "@/lib/subscription/fulfillPurchase";
import Invoice from "@/models/Invoice";
import logger from "@/lib/logger";
import type { PaymentWebhookEvent } from "@/lib/payments/types";

/**
 * Apply a gateway payment to an existing invoice (from /api/invoices/[id]/pay).
 * Idempotent by payment referenceNumber.
 */
async function applyInvoicePayment(event: PaymentWebhookEvent, invoiceId: string) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return { error: `Invoice ${invoiceId} not found` };

  const alreadyRecorded = invoice.payments?.some(
    (p: { referenceNumber?: string }) => p.referenceNumber === event.paymentId,
  );
  if (alreadyRecorded) return { status: "already_processed" };

  invoice.payments.push({
    amount: event.amount,
    paymentDate: new Date(),
    paymentMethod: "online",
    referenceNumber: event.paymentId,
    notes: `Gateway: ${event.provider}`,
    recordedBy: invoice.userId,
  });
  invoice.paidAmount = (invoice.paidAmount ?? 0) + event.amount;
  invoice.balanceDue = Math.max(0, invoice.totalAmount - invoice.paidAmount);
  if (invoice.balanceDue <= 0) {
    invoice.status = "paid";
    invoice.paidAt = new Date();
  } else {
    invoice.status = "partially_paid";
  }
  await invoice.save();

  return { status: "fulfilled", invoiceNumber: invoice.invoiceNumber };
}

export async function POST(req: NextRequest) {
  if (!isPaymentGatewayEnabled()) {
    return NextResponse.json({ error: "payment_gateway_not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature =
    req.headers.get("stripe-signature") ??
    req.headers.get("x-razorpay-signature") ??
    "";

  let event;
  try {
    event = await getPaymentGateway().verifyWebhook(rawBody, signature);
  } catch (err) {
    logger.warn({ err }, "Payment webhook signature verification failed");
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.eventType !== "payment.success") {
    // payment.failed / payment.refunded — nothing to fulfill yet
    return NextResponse.json({ received: true, ignored: event.eventType });
  }

  await connectDB();

  const { userId, planId, invoiceId } = event.metadata ?? {};

  // Case 1: payment against an existing invoice (/api/invoices/[id]/pay)
  if (invoiceId) {
    const invoiceResult = await applyInvoicePayment(event, invoiceId);
    if (invoiceResult.error) {
      logger.error({ paymentId: event.paymentId, error: invoiceResult.error }, "Invoice payment application failed");
      return NextResponse.json({ error: invoiceResult.error }, { status: 500 });
    }
    return NextResponse.json({ received: true, ...invoiceResult });
  }

  // Case 2: subscription plan purchase (/api/subscriptions/checkout)
  if (!userId || !planId) {
    logger.error({ paymentId: event.paymentId }, "Payment webhook missing userId/planId metadata");
    // 200 — retrying won't add the missing metadata
    return NextResponse.json({ received: true, error: "missing_metadata" });
  }

  const result = await fulfillSubscriptionPurchase({
    userId,
    planId,
    paymentId: event.paymentId,
    provider: event.provider,
    amount: event.amount,
    currency: event.currency,
  });

  if (result.status === "error") {
    logger.error({ paymentId: event.paymentId, error: result.error }, "Subscription fulfillment failed");
    // 500 so the gateway retries — fulfillment is idempotent
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ received: true, ...result });
}
