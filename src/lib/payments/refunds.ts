/**
 * Gateway refund → credit note + commission clawback.
 *
 * Providers report refunds either cumulatively (Stripe charge.refunded:
 * amount_refunded) or per refund (Razorpay refund.processed). Credit notes
 * created here carry externalRef `gw:<provider>:<paymentId>[:<refundId>]`, so
 * the delta still to book is `cumulative − already booked` and redeliveries
 * never double-count.
 */

import logger from "@/lib/logger";
import { logActivity } from "@/lib/audit/log";
import { issueCreditNote, maxRefundable, CreditNoteError } from "@/lib/invoices/creditNote";
import Invoice from "@/models/Invoice";
import { toCents } from "./currency";
import type { PaymentWebhookEvent } from "./types";

export interface GatewayRefundResult {
  status: "credit_note_issued" | "already_recorded" | "invoice_not_found" | "skipped";
  invoiceId?: string;
  creditNoteNumber?: string;
  amount?: number;
  fullyRefunded?: boolean;
  clawedBack?: number;
  annotated?: number;
  reason?: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function applyGatewayRefund(event: PaymentWebhookEvent): Promise<GatewayRefundResult> {
  const invoiceId = event.metadata?.invoiceId;
  const invoice = invoiceId
    ? await Invoice.findById(invoiceId)
    : event.paymentId
      ? await Invoice.findOne({ "payments.referenceNumber": event.paymentId })
      : null;
  if (!invoice) return { status: "invoice_not_found" };

  const refPrefix = `gw:${event.provider}:${event.paymentId}`;
  const booked = await Invoice.find({
    parentInvoiceId: invoice._id,
    status: "credit_note",
    externalRef: { $regex: `^${escapeRegex(refPrefix)}` },
  })
    .select("totalAmount externalRef")
    .lean();

  const refundId = event.refund?.refundId;
  let amountC: number;
  let externalRef: string;

  if (event.refund?.cumulativeAmount !== undefined) {
    const bookedC = booked.reduce((sum, cn) => sum + toCents(cn.totalAmount), 0);
    amountC = toCents(event.refund.cumulativeAmount) - bookedC;
    externalRef = refundId ? `${refPrefix}:${refundId}` : `${refPrefix}:${toCents(event.refund.cumulativeAmount)}`;
  } else {
    if (refundId && booked.some((cn) => cn.externalRef === `${refPrefix}:${refundId}`)) {
      return { status: "already_recorded", invoiceId: String(invoice._id) };
    }
    amountC = toCents(event.refund?.amount ?? event.amount);
    externalRef = `${refPrefix}:${refundId ?? toCents(event.amount)}`;
  }

  if (amountC <= 0) return { status: "already_recorded", invoiceId: String(invoice._id) };

  // Never book more than is still refundable on the invoice.
  const capC = toCents(maxRefundable(invoice));
  if (capC <= 0) return { status: "skipped", invoiceId: String(invoice._id), reason: "nothing_refundable" };
  const amount = Math.min(amountC, capC) / 100;

  try {
    const result = await issueCreditNote(invoice, {
      amount,
      reason: `Gateway refund (${event.provider})`,
      notes: `Refund of payment ${event.paymentId}${refundId ? ` (refund ${refundId})` : ""} via ${event.provider}.`,
      externalRef,
    });

    await logActivity({
      actorRole: "system",
      action: "invoice.gateway_refund",
      resource: "invoices",
      resourceId: String(invoice._id),
      meta: {
        provider: event.provider,
        paymentId: event.paymentId,
        refundId,
        amount,
        currency: invoice.currency,
        creditNoteNumber: result.creditNoteNumber,
        fullyRefunded: result.fullyRefunded,
        commissionsClawedBack: result.commissionClawback.clawedBack,
      },
    });

    return {
      status: "credit_note_issued",
      invoiceId: String(invoice._id),
      creditNoteNumber: result.creditNoteNumber,
      amount,
      fullyRefunded: result.fullyRefunded,
      clawedBack: result.commissionClawback.clawedBack,
      annotated: result.commissionClawback.annotated,
    };
  } catch (err) {
    if (err instanceof CreditNoteError) {
      logger.warn({ invoiceId: String(invoice._id), paymentId: event.paymentId, reason: err.message }, "Gateway refund not booked");
      return { status: "skipped", invoiceId: String(invoice._id), reason: err.message };
    }
    throw err;
  }
}
