/**
 * markInvoicePaid — the single "money arrived for this invoice" path.
 *
 * Shared by the gateway webhook, the return-page confirmation and staff
 * verification of a manual (bank transfer) payment notification, so all three
 * apply the same rules:
 *
 * - Refuses void / cancelled / refunded / credit-note / draft / unapproved /
 *   already-paid invoices (gateway money in that case is flagged for a manual
 *   refund, never silently applied).
 * - Currency must match the invoice; amount must be > 0 and ≤ the balance due.
 *   Partial amounts are recorded as payments; the invoice turns `paid` only
 *   once the balance is fully covered.
 * - Gateway payments are idempotent by provider payment id.
 * - On `paid`: commission records are created and auto-approved (with the
 *   approver's own lines excluded), the embedded lines mirrored, the
 *   invoice.paid webhook dispatched, and a subscription invoice's plan change /
 *   renewal applied (applyPaidInvoiceToSubscription).
 */

import mongoose from "mongoose";
import logger from "@/lib/logger";
import { logActivity } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import {
  approvePendingCommissionsForPaidInvoice,
  createCommissionRecordsForInvoice,
  isOwnCommissionLine,
} from "@/lib/invoices/commissionRecords";
import { PAYMENT_BLOCKED_INVOICE_STATUSES } from "@/lib/invoices/status";
import { isStaleInvoiceWrite } from "@/lib/invoices/concurrency";
import Invoice, { type IInvoice } from "@/models/Invoice";
import { toCents } from "./currency";
import { applyPaidInvoiceToSubscription, type FulfilmentResult } from "./subscriptionFulfillment";
import type { PaymentMethodType, PaymentProvider } from "./types";

export interface MarkInvoicePaidInput {
  provider: PaymentProvider;
  /** Provider payment id (pi_… / pay_…) or the manual reference number. */
  paymentId: string;
  amount: number;
  currency: string;
  method?: PaymentMethodType | string;
  /** Staff user who verified a manual payment. Omit for gateway payments. */
  actorUserId?: string;
  actorRole?: string;
  notes?: string;
  /** Default true. verify-payment sends its own wording. */
  notifyPayer?: boolean;
  /** Default true. verify-payment writes its own audit entry. */
  audit?: boolean;
}

export type MarkInvoicePaidStatus =
  | "paid"
  | "partially_paid"
  | "already_processed"
  | "rejected"
  | "not_found"
  | "conflict";

export interface MarkInvoicePaidResult {
  status: MarkInvoicePaidStatus;
  reason?:
    | "invoice_not_payable"
    | "already_paid"
    | "currency_mismatch"
    | "amount_exceeds_balance"
    | "invalid_amount";
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: string;
  balanceDue?: number;
  commissionsApproved?: number;
  subscription?: FulfilmentResult;
}

type InvoiceDoc = IInvoice & mongoose.Document & { increment(): void };

const MAX_RETRIES = 3;

/** Gateway / notification method → Invoice payment enum. */
export function toInvoicePaymentMethod(
  provider: PaymentProvider,
  method?: string,
): "bank_transfer" | "cash" | "cheque" | "credit_card" | "online" | "other" {
  if (method === "card" || method === "credit_card") return "credit_card";
  if (method === "bank_transfer" || method === "cash" || method === "cheque") return method;
  if (provider !== "manual") return "online";
  if (method === "online" || method === "other") return method;
  return "bank_transfer";
}

function idOf(value: unknown): string {
  if (value && typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
    return String((value as { _id: unknown })._id);
  }
  return String(value ?? "");
}

/**
 * Record a payment. Pass an invoice id (gateway paths — reloads and retries on
 * concurrent writes) or an already-loaded document (manual paths — a stale
 * write returns `conflict` so the route can answer 409).
 */
export async function markInvoicePaid(
  invoiceOrId: string | InvoiceDoc,
  input: MarkInvoicePaidInput,
): Promise<MarkInvoicePaidResult> {
  const preloaded = typeof invoiceOrId !== "string";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const invoice = (preloaded ? invoiceOrId : await Invoice.findById(invoiceOrId)) as InvoiceDoc | null;
    if (!invoice) return { status: "not_found" };

    const outcome = await tryRecordPayment(invoice, input);
    if (outcome !== "stale") return outcome;
    if (preloaded) return { status: "conflict", invoiceId: String(invoice._id) };
    // Another writer touched the invoice between load and save — reload and
    // re-evaluate (the other writer may even have recorded this payment).
  }
  return { status: "conflict", invoiceId: typeof invoiceOrId === "string" ? invoiceOrId : String(invoiceOrId._id) };
}

async function tryRecordPayment(
  invoice: InvoiceDoc,
  input: MarkInvoicePaidInput,
): Promise<MarkInvoicePaidResult | "stale"> {
  const invoiceId = String(invoice._id);
  const summary = () => ({
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    invoiceStatus: invoice.status,
    balanceDue: invoice.balanceDue,
  });

  // Idempotency for gateway payments: the provider payment id is recorded once.
  if (input.provider !== "manual" && input.paymentId) {
    const already = (invoice.payments ?? []).some((p) => p.referenceNumber === input.paymentId);
    if (already) {
      // A previous delivery may have crashed after saving but before the
      // subscription effect ran — the fulfilment claim makes this a no-op
      // when it already happened.
      const subscription = await applyPaidInvoiceToSubscription(invoice, {
        provider: input.provider,
        paymentId: input.paymentId,
      }).catch((err: unknown) => {
        logger.error({ err, invoiceId }, "Subscription fulfilment retry failed");
        return undefined;
      });
      return { status: "already_processed", ...summary(), subscription };
    }
  }

  if ((PAYMENT_BLOCKED_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
    return {
      status: "rejected",
      reason: invoice.status === "paid" ? "already_paid" : "invoice_not_payable",
      ...summary(),
    };
  }

  if ((input.currency || "").toUpperCase() !== (invoice.currency || "").toUpperCase()) {
    return { status: "rejected", reason: "currency_mismatch", ...summary() };
  }

  const amountC = toCents(input.amount);
  const totalC = toCents(invoice.totalAmount || invoice.amount);
  const paidC = toCents(invoice.paidAmount || 0);
  const balanceC = Math.max(0, totalC - paidC - toCents(invoice.refundedAmount || 0));
  if (!(amountC > 0)) return { status: "rejected", reason: "invalid_amount", ...summary() };
  if (amountC > balanceC) return { status: "rejected", reason: "amount_exceeds_balance", ...summary() };

  const now = new Date();
  const recordedBy = (input.actorUserId ?? idOf(invoice.userId)) as unknown as mongoose.Types.ObjectId;
  invoice.payments.push({
    amount: amountC / 100,
    paymentDate: now,
    paymentMethod: toInvoicePaymentMethod(input.provider, input.method),
    referenceNumber: input.paymentId?.slice(0, 100) || undefined,
    notes: (input.notes ?? (input.provider !== "manual" ? `Gateway: ${input.provider}` : undefined))?.slice(0, 500),
    recordedBy,
  });

  // Mirror the pre-save arithmetic so the in-memory doc (and callers) see the
  // result even before the hook runs.
  const newPaidC = paidC + amountC;
  invoice.paidAmount = newPaidC / 100;
  invoice.balanceDue = Math.max(0, balanceC - amountC) / 100;
  if (newPaidC >= totalC && totalC > 0) {
    invoice.status = "paid";
    invoice.paidAt = now;
    if (input.actorUserId) invoice.markedPaidBy = input.actorUserId as unknown as mongoose.Types.ObjectId;
  } else {
    invoice.status = "partially_paid";
  }

  // Version-checked save (see lib/invoices/concurrency.ts).
  invoice.increment();
  try {
    await invoice.save();
  } catch (err) {
    if (isStaleInvoiceWrite(err)) return "stale";
    throw err;
  }

  let commissionsApproved = 0;
  let subscription: FulfilmentResult | undefined;

  if (invoice.status === "paid") {
    commissionsApproved = await settleCommissions(invoice, input);

    dispatchWebhook("invoice.paid", {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      currency: invoice.currency,
      status: "paid",
      paidAt: invoice.paidAt?.toISOString(),
    }, invoice.employerId ? String(invoice.employerId) : null);

    try {
      subscription = await applyPaidInvoiceToSubscription(invoice, {
        provider: input.provider,
        paymentId: input.paymentId,
      });
    } catch (err) {
      // The payment is recorded; the claim was released so a gateway retry
      // (or the return-page confirm) re-attempts activation.
      logger.error({ err, invoiceId }, "Subscription activation after payment failed");
      subscription = { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (input.audit !== false) {
    await logActivity({
      ...(input.actorUserId ? { actorId: input.actorUserId, actorRole: input.actorRole } : { actorRole: "system" }),
      action: input.provider === "manual" ? "invoice.payment_recorded" : "invoice.gateway_payment",
      resource: "invoices",
      resourceId: invoiceId,
      meta: {
        provider: input.provider,
        paymentId: input.paymentId,
        amount: amountC / 100,
        currency: invoice.currency,
        method: input.method,
        newStatus: invoice.status,
        newBalance: invoice.balanceDue,
        commissionsApproved,
        subscription: subscription?.status,
      },
    });
  }

  if (input.notifyPayer !== false) {
    await notify({
      userId: idOf(invoice.userId),
      type: "system",
      title: invoice.status === "paid" ? "Payment received" : "Partial payment received",
      message:
        invoice.status === "paid"
          ? `We received your payment of ${invoice.currency} ${(amountC / 100).toFixed(2)} for invoice ${invoice.invoiceNumber}. Thank you!`
          : `We received ${invoice.currency} ${(amountC / 100).toFixed(2)} for invoice ${invoice.invoiceNumber}. Remaining balance: ${invoice.currency} ${invoice.balanceDue.toFixed(2)}.`,
      link: invoice.category === "subscription" && !invoice.employerId ? "/job-seeker/subscription" : "/employer/invoices",
      sendEmail: true,
    }).catch((err: unknown) => logger.warn({ err, invoiceId }, "Payment received notification failed"));
  }

  return {
    status: invoice.status === "paid" ? "paid" : "partially_paid",
    ...summary(),
    commissionsApproved,
    subscription,
  };
}

/**
 * Create + approve commission records for a paid invoice and mirror onto the
 * embedded lines — the same sequence staff verification always used. Failures
 * are logged, never thrown: the payment itself is already recorded.
 */
async function settleCommissions(invoice: InvoiceDoc, input: MarkInvoicePaidInput): Promise<number> {
  const invoiceId = String(invoice._id);
  try {
    await createCommissionRecordsForInvoice({
      invoiceId: invoice._id,
      commissions: invoice.commissions ?? [],
      currency: invoice.currency,
    });
    // Gateway payments are confirmed by the provider, not by a person, so the
    // payer is recorded as the approver (they own no commission line, so the
    // self-approval exclusion never removes anything).
    const approver = input.actorUserId ?? idOf(invoice.userId);
    const result = await approvePendingCommissionsForPaidInvoice(invoice._id, approver, {
      sendNotifications: true,
    });

    if (result.approved > 0) {
      let changed = false;
      for (const line of invoice.commissions ?? []) {
        if (line.status === "pending" && !isOwnCommissionLine(line, result.approver)) {
          line.status = "approved";
          changed = true;
        }
      }
      if (changed) await invoice.save();
    }
    return result.approved;
  } catch (err) {
    logger.error({ err, invoiceId }, "Commission processing after payment failed");
    return 0;
  }
}
