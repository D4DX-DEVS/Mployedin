/**
 * POST /api/invoices/[id]/payments — Record a payment against an invoice (partial or full).
 * GET  /api/invoices/[id]/payments — List payments for an invoice.
 *
 * Admin / super_agent only.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { invoicePaymentSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { canAccessInvoice } from "@/lib/invoices/access";
import {
  approvePendingCommissionsForPaidInvoice,
  isOwnCommissionLine,
  revertApprovedCommissions,
  sendCommissionApprovalNotifications,
} from "@/lib/invoices/commissionRecords";
import { PAYMENT_BLOCKED_INVOICE_STATUSES } from "@/lib/invoices/status";
import { isStaleInvoiceWrite, staleInvoiceResponse } from "@/lib/invoices/concurrency";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import connectDB from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import Invoice from "@/models/Invoice";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function logAccessDenied(req: NextRequest, ctx: AuthCtx, invoice: { _id?: unknown; userId?: unknown; agentId?: unknown }, operation: string) {
  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.access_denied",
    resource: "invoices",
    resourceId: String(invoice._id ?? "unknown"),
    meta: {
      operation,
      invoiceUserId: String(invoice.userId ?? ""),
      invoiceAgentId: String(invoice.agentId ?? ""),
    },
    req,
  });
}

// ── GET: list payments ──────────────────────────────────────────────────────
async function getHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  await connectDB();
  const invoice = await Invoice.findById(params?.id)
    .select("invoiceNumber userId agentId payments paidAmount balanceDue totalAmount currency status")
    .populate("payments.recordedBy", "name email")
    .lean();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!(await canAccessInvoice(ctx, invoice))) {
    await logAccessDenied(req, ctx, invoice, "GET_PAYMENTS");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    balanceDue: invoice.balanceDue,
    currency: invoice.currency,
    status: invoice.status,
    payments: invoice.payments ?? [],
  });
}

// ── POST: record payment ────────────────────────────────────────────────────
async function postHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  // Only admin / super_agent can record payments
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, invoicePaymentSchema);

  const invoice = await Invoice.findById(params?.id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!(await canAccessInvoice(ctx, invoice))) {
    await logAccessDenied(req, ctx, invoice, "POST_PAYMENT");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot pay drafts, unapproved, closed, or already-paid invoices
  if ((PAYMENT_BLOCKED_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
    return NextResponse.json({ error: `Cannot record payment on ${invoice.status} invoice` }, { status: 400 });
  }

  // Check overpayment
  const currentPaid = invoice.paidAmount || 0;
  const total = invoice.totalAmount || invoice.amount;
  if (currentPaid + body.amount > total) {
    return NextResponse.json({
      error: `Payment of ${body.amount} would exceed balance due of ${total - currentPaid}`,
    }, { status: 400 });
  }
  // Add payment record
  invoice.payments.push({
    amount: body.amount,
    paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
    paymentMethod: body.paymentMethod ?? "bank_transfer",
    referenceNumber: body.referenceNumber,
    notes: body.notes,
    recordedBy: ctx.userId as unknown as typeof invoice.markedPaidBy,
  });

  // Pre-save hook will recalculate paidAmount, balanceDue, and status.
  // increment() makes this save conditional on __v, so a payment recorded by a
  // concurrent request becomes a 409 instead of a second, overpaying $push.
  invoice.increment();
  try {
    await invoice.save();
  } catch (err) {
    if (isStaleInvoiceWrite(err)) return staleInvoiceResponse();
    throw err;
  }
  let commissionsApproved = 0;
  let commissionNotificationFailures = 0;
  let commissionApprovalFailed = false;
  let embeddedCommissionSyncFailed = false;

  if (invoice.status === "paid") {
    try {
      const approvedCommissionsResult = await approvePendingCommissionsForPaidInvoice(
        invoice._id,
        ctx.userId,
        { sendNotifications: false },
      );
      commissionsApproved = approvedCommissionsResult.approved;

      if (commissionsApproved > 0) {
        // Same self-approval exclusion as the external records above, so the
        // approver's own embedded line is not silently marked approved.
        for (const commission of invoice.commissions ?? []) {
          if (
            commission.status === "pending" &&
            !isOwnCommissionLine(commission, approvedCommissionsResult.approver)
          ) {
            commission.status = "approved";
          }
        }
        try {
          await invoice.save();
        } catch (err) {
          embeddedCommissionSyncFailed = true;
          logger.error({
            err,
            invoiceId: String(invoice._id),
            approvedCommissionIds: approvedCommissionsResult.approvedCommissionIds.map(String),
          }, "Embedded commission sync failed; rolling back external approvals");

          try {
            await revertApprovedCommissions(approvedCommissionsResult.approvedCommissionIds);
          } catch (rollbackErr) {
            logger.error({
              err: rollbackErr,
              invoiceId: String(invoice._id),
              approvedCommissionIds: approvedCommissionsResult.approvedCommissionIds.map(String),
            }, "Commission approval rollback failed");
            throw rollbackErr;
          }

          commissionsApproved = 0;
        }

        if (!embeddedCommissionSyncFailed) {
          try {
            commissionNotificationFailures = await sendCommissionApprovalNotifications(
              approvedCommissionsResult.notifications,
            );
          } catch (err) {
            logger.error({ err, invoiceId: String(invoice._id) }, "Commission approval notifications failed");
            commissionNotificationFailures = approvedCommissionsResult.notifications.length;
          }
        }
      }
    } catch (err) {
      logger.error({ err, invoiceId: String(invoice._id) }, "Commission approval failed after invoice payment");
      commissionApprovalFailed = true;
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.payment_recorded",
    resource: "invoices",
    resourceId: invoice._id.toString(),
    meta: {
      paymentAmount: body.amount,
      paymentMethod: body.paymentMethod,
      newPaidAmount: invoice.paidAmount,
      newBalance: invoice.balanceDue,
      newStatus: invoice.status,
      commissionsApproved,
      commissionNotificationFailures,
      commissionApprovalFailed,
      embeddedCommissionSyncFailed,
    },
    req,
  });

  if (invoice.status === "paid") {
    dispatchWebhook("invoice.paid", {
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      currency: invoice.currency,
      status: "paid",
      paidAt: invoice.paidAt?.toISOString(),
    });
  }

  return NextResponse.json({
    message: `Payment of ${body.amount} recorded. Balance: ${invoice.balanceDue}`,
    invoice: {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      balanceDue: invoice.balanceDue,
      status: invoice.status,
      payments: invoice.payments,
      commissionsApproved,
      commissionNotificationFailures,
      commissionApprovalFailed,
      embeddedCommissionSyncFailed,
    },
  });
}

export const GET = withAuth(getHandler, { resource: "invoices", action: "read" });
export const POST = withAuth(postHandler, { resource: "invoices", action: "update" });
