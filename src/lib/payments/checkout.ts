/**
 * Open (or reuse) a hosted checkout session for an invoice's balance.
 *
 * Amounts always come from the invoice in the database — never from the
 * client. A still-valid session for the same amount is reused so a double
 * click / back-button doesn't mint a second payable link.
 */

import mongoose from "mongoose";
import Invoice, { type IInvoice } from "@/models/Invoice";
import { getPaymentGateway } from "./index";
import { toCents } from "./currency";
import type { PaymentPurpose } from "./types";

type InvoiceLike = Pick<
  IInvoice,
  "_id" | "invoiceNumber" | "totalAmount" | "amount" | "paidAmount" | "refundedAmount" | "currency" | "gatewaySession" | "description" | "planName" | "subscriptionId"
>;

export interface StartCheckoutOptions {
  /** e.g. https://app.example.com (no trailing slash). */
  baseUrl: string;
  locale: string;
  /** Path under the locale the provider returns to, e.g. "/employer/subscription". */
  returnPath: string;
  customerEmail: string;
  customerName: string;
  purpose: PaymentPurpose;
  /** Employer _id when the payer is an employer; recorded in provider metadata. */
  payerId: string;
}

export interface StartCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  provider: "stripe" | "razorpay";
  amount: number;
  currency: string;
  reused: boolean;
}

/** Reuse a session only if it has at least this long left. */
const REUSE_MARGIN_MS = 5 * 60 * 1000;

export function invoiceBalance(invoice: Pick<IInvoice, "totalAmount" | "amount" | "paidAmount" | "refundedAmount">): number {
  const c = toCents(invoice.totalAmount || invoice.amount) - toCents(invoice.paidAmount || 0) - toCents(invoice.refundedAmount || 0);
  return Math.max(0, c) / 100;
}

export async function startInvoiceCheckout(
  invoice: InvoiceLike,
  opts: StartCheckoutOptions,
): Promise<StartCheckoutResult> {
  const gateway = getPaymentGateway();
  const provider = gateway.provider as "stripe" | "razorpay";
  const amount = invoiceBalance(invoice);
  if (amount <= 0) throw new Error("Invoice has no balance due");
  const currency = (invoice.currency || "AED").toUpperCase();

  const existing = invoice.gatewaySession;
  if (
    existing &&
    existing.provider === provider &&
    existing.checkoutUrl &&
    toCents(existing.amount) === toCents(amount) &&
    existing.currency === currency &&
    existing.expiresAt &&
    new Date(existing.expiresAt).getTime() - Date.now() > REUSE_MARGIN_MS
  ) {
    return {
      checkoutUrl: existing.checkoutUrl,
      sessionId: existing.sessionId,
      provider,
      amount,
      currency,
      reused: true,
    };
  }

  // Claim a unique attempt number first — it keys the provider idempotency
  // header / Razorpay reference_id, so concurrent clicks never collide.
  const bumped = await Invoice.findOneAndUpdate(
    { _id: invoice._id },
    { $inc: { gatewayAttempt: 1 } },
    { returnDocument: "after", projection: { gatewayAttempt: 1 } },
  ).lean<{ gatewayAttempt?: number } | null>();
  const attempt = bumped?.gatewayAttempt ?? 1;

  const invoiceId = String(invoice._id);
  const root = `${opts.baseUrl.replace(/\/$/, "")}/${opts.locale}${opts.returnPath}`;
  const q = (extra: string) => `${root}?${extra}&invoice=${encodeURIComponent(invoiceId)}`;

  const session = await gateway.createSession({
    invoiceId,
    employerId: opts.payerId,
    amount,
    currency,
    description: `Invoice ${invoice.invoiceNumber}${invoice.planName ? ` — ${invoice.planName}` : invoice.description ? ` — ${invoice.description}` : ""}`,
    customerEmail: opts.customerEmail,
    customerName: opts.customerName,
    metadata: { invoiceNumber: invoice.invoiceNumber },
    subscriptionId: invoice.subscriptionId ? String(invoice.subscriptionId) : undefined,
    purpose: opts.purpose,
    attempt,
    locale: opts.locale,
    successUrl: q(`checkout=success&provider=${provider}`),
    cancelUrl: q(`checkout=cancelled&provider=${provider}`),
  });

  await Invoice.updateOne(
    { _id: invoice._id as mongoose.Types.ObjectId },
    {
      $set: {
        gatewaySession: {
          provider,
          sessionId: session.sessionId,
          checkoutUrl: session.checkoutUrl,
          amount,
          currency,
          attempt,
          createdAt: new Date(),
          expiresAt: session.expiresAt,
        },
      },
    },
  );

  return {
    checkoutUrl: session.checkoutUrl,
    sessionId: session.sessionId,
    provider,
    amount,
    currency,
    reused: false,
  };
}
