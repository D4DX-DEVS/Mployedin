/**
 * Credit note issuance — shared by the admin credit-note route and gateway
 * refund webhooks, so a refund made in the Stripe / Razorpay dashboard lands
 * in the books exactly like one issued from the admin UI.
 */

import mongoose from "mongoose";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import { clawBackCommissionsForRefund } from "@/lib/invoices/commissionRecords";
import Invoice, { type IInvoice } from "@/models/Invoice";

export interface IssueCreditNoteInput {
  amount: number;
  reason: string;
  notes?: string;
  /** Staff user issuing it; omitted for gateway refunds. */
  actorUserId?: string;
  /** Gateway refund reference — stored on the credit note for dedupe. */
  externalRef?: string;
}

export interface IssueCreditNoteResult {
  creditNote: IInvoice;
  creditNoteNumber: string;
  fullyRefunded: boolean;
  commissionClawback: { clawedBack: number; annotated: number };
}

export class CreditNoteError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "CreditNoteError";
  }
}

type InvoiceDoc = IInvoice & mongoose.Document;

export function maxRefundable(invoice: Pick<IInvoice, "totalAmount" | "refundedAmount">): number {
  return Math.round(((invoice.totalAmount || 0) - (invoice.refundedAmount || 0)) * 100) / 100;
}

export async function issueCreditNote(
  invoice: InvoiceDoc,
  input: IssueCreditNoteInput,
): Promise<IssueCreditNoteResult> {
  if (["void", "cancelled"].includes(invoice.status)) {
    throw new CreditNoteError(`Cannot issue credit note for ${invoice.status} invoice`);
  }
  const cap = maxRefundable(invoice);
  if (input.amount > cap) {
    throw new CreditNoteError(`Refund amount exceeds maximum refundable amount of ${cap}`);
  }

  const creditNoteNumber = await generateInvoiceNumber();
  const creditNote = await Invoice.create({
    invoiceNumber: creditNoteNumber,
    category: invoice.category,
    userId: invoice.userId,
    jobId: invoice.jobId,
    employerId: invoice.employerId,
    agentId: invoice.agentId,
    type: invoice.type,
    description: `Credit note for ${invoice.invoiceNumber}: ${input.reason}`,
    lineItems: [{ description: `Credit note — ${input.reason}`, quantity: 1, unitPrice: input.amount, amount: input.amount }],
    subtotal: input.amount,
    totalAmount: input.amount,
    amount: input.amount,
    currency: invoice.currency,
    billingDetails: invoice.billingDetails,
    status: "credit_note",
    issuedAt: new Date(),
    notes: input.notes,
    creditNoteNumber,
    parentInvoiceId: invoice._id,
    externalRef: input.externalRef,
    createdBy: input.actorUserId,
  });

  invoice.refundedAmount = (invoice.refundedAmount || 0) + input.amount;
  const fullyRefunded = invoice.refundedAmount >= invoice.totalAmount;
  if (fullyRefunded) invoice.status = "refunded";
  await invoice.save();

  // CM-5: the fee the commissions were earned on has been (partly) returned.
  const commissionClawback = await clawBackCommissionsForRefund(invoice._id, {
    fullyRefunded,
    amount: input.amount,
    currency: invoice.currency,
    reason: `Credit note ${creditNoteNumber}: ${input.reason}`,
    clawbackBy: input.actorUserId,
    dedupeKey: input.externalRef ? `refund:${input.externalRef}` : undefined,
  });

  dispatchWebhook("invoice.credit_note", {
    invoiceId: String(invoice._id),
    creditNoteId: String(creditNote._id),
    creditNoteNumber,
    amount: input.amount,
    currency: invoice.currency,
  }, invoice.employerId ? String(invoice.employerId) : null);

  return { creditNote, creditNoteNumber, fullyRefunded, commissionClawback };
}
