/**
 * GET   /api/invoices/[id] — Get single invoice (IDOR-protected)
 * PATCH /api/invoices/[id] — Update invoice status / notes (admin/super_agent)
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { invoiceUpdateSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { canAccessInvoice } from "@/lib/invoices/access";
import {
  approvePendingCommissionsForPaidInvoice,
  createCommissionRecordsForInvoice,
  revertApprovedCommissions,
  reverseCommissionsForInvoice,
  sendCommissionApprovalNotifications,
} from "@/lib/invoices/commissionRecords";
import { PAYABLE_INVOICE_STATUSES } from "@/lib/invoices/status";
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
    resource: "subscriptions",
    resourceId: String(invoice._id ?? "unknown"),
    meta: {
      operation,
      invoiceUserId: String(invoice.userId ?? ""),
      invoiceAgentId: String(invoice.agentId ?? ""),
    },
    req,
  });
}

// ── GET ──────────────────────────────────────────────────────────────────────
async function getHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  await connectDB();

  const accessInvoice = await Invoice.findById(params?.id)
    .select("userId agentId")
    .lean();
  if (!accessInvoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!(await canAccessInvoice(ctx, accessInvoice))) {
    await logAccessDenied(req, ctx, accessInvoice, "GET");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoice = await Invoice.findById(params?.id)
    .populate("jobId", "title")
    .populate("employerId", "companyName companyEmail phone address country taxId")
    .populate("agentId", "userId commissionRate")
    .populate("payments.recordedBy", "name email")
    .lean();
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ invoice });
}

// ── PATCH ────────────────────────────────────────────────────────────────────
async function patchHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  // Only admin/super_agent can update invoice status
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, invoiceUpdateSchema);

  const invoice = await Invoice.findById(params?.id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!(await canAccessInvoice(ctx, invoice))) {
    await logAccessDenied(req, ctx, invoice, "PATCH");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot modify already-void/refunded invoices
  if (["void", "refunded"].includes(invoice.status)) {
    return NextResponse.json(
      { error: `Cannot modify a ${invoice.status} invoice` },
      { status: 400 },
    );
  }

  const before = { status: invoice.status, notes: invoice.notes, internalNotes: invoice.internalNotes };
  let commissionsCreated = 0;
  let commissionsReversed = 0;
  let commissionsAlreadyPaid = 0;
  let commissionsApproved = 0;
  let commissionNotificationFailures = 0;
  let commissionApprovalFailed = false;
  let embeddedCommissionSyncFailed = false;

  if (body.status === "paid") {
    if (!(PAYABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
      return NextResponse.json({ error: "Invoice must be issued before it can be marked paid" }, { status: 400 });
    }
    const paidAt = new Date();
    const total = invoice.totalAmount || invoice.amount;
    const currentPaid = invoice.paidAmount || 0;
    const remainingBalance = Math.max(0, Math.round((total - currentPaid) * 100) / 100);

    if (remainingBalance > 0) {
      invoice.payments.push({
        amount: remainingBalance,
        paymentDate: paidAt,
        paymentMethod: "other",
        referenceNumber: "STATUS-PAID",
        notes: "Recorded automatically when the invoice was marked paid.",
        recordedBy: ctx.userId as unknown as typeof invoice.markedPaidBy,
      });
    }

    invoice.status = "paid";
    invoice.paidAt = paidAt;
    invoice.paidAmount = total;
    invoice.balanceDue = 0;
    invoice.markedPaidBy = ctx.userId as unknown as typeof invoice.markedPaidBy;
  } else if (body.status === "issued") {
    if (!["draft", "pending_approval"].includes(invoice.status)) {
      return NextResponse.json({ error: `Cannot issue a ${invoice.status} invoice` }, { status: 400 });
    }
    const wasPendingApproval = invoice.status === "pending_approval";
    if (wasPendingApproval && !["admin", "super_agent"].includes(ctx.role)) {
      return NextResponse.json({ error: "Only admin or super-agent users can approve invoices" }, { status: 403 });
    }
    invoice.status = "issued";
    invoice.issuedAt = new Date();
    if (wasPendingApproval) {
      invoice.approvedBy = ctx.userId as unknown as typeof invoice.markedPaidBy;
      invoice.approvedAt = new Date();
    }
    const createdCommissions = await createCommissionRecordsForInvoice({
      invoiceId: invoice._id,
      commissions: invoice.commissions ?? [],
      currency: invoice.currency,
    });
    commissionsCreated = createdCommissions.length;
  } else if (body.status === "pending_approval") {
    if (invoice.status !== "draft") {
      return NextResponse.json({ error: `Cannot submit a ${invoice.status} invoice for approval` }, { status: 400 });
    }
    invoice.status = "pending_approval";
  } else if (body.status === "sent") {
    if (!["issued", "sent"].includes(invoice.status)) {
      return NextResponse.json({ error: "Invoice must be issued before it can be sent" }, { status: 400 });
    }
    if (!invoice.sentAt) invoice.sentAt = new Date();
    invoice.status = "sent";
  } else if (body.status === "overdue") {
    if (!(PAYABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
      return NextResponse.json({ error: "Only issued invoices can be marked overdue" }, { status: 400 });
    }
    invoice.status = "overdue";
  } else if (body.status === "cancelled") {
    if (invoice.status !== "pending_approval") {
      return NextResponse.json({ error: "Only pending approval invoices can be rejected" }, { status: 400 });
    }
    invoice.status = body.status;
    invoice.voidedBy = ctx.userId as unknown as typeof invoice.voidedBy;
    invoice.voidedAt = new Date();
    if (body.voidReason) invoice.voidReason = body.voidReason;
    invoice.rejectedBy = ctx.userId as unknown as typeof invoice.markedPaidBy;
    invoice.rejectedAt = new Date();
    invoice.rejectionReason = body.rejectionReason ?? body.voidReason;
    if (body.rejectionReason && !invoice.voidReason) invoice.voidReason = body.rejectionReason;
    // Reverse any pending/approved commissions tied to this invoice
    const cancelReversalResult = await reverseCommissionsForInvoice(invoice._id);
    commissionsReversed = cancelReversalResult.reversed;
    commissionsAlreadyPaid = cancelReversalResult.alreadyPaid;
  } else if (body.status === "void") {
    invoice.status = body.status;
    invoice.voidedBy = ctx.userId as unknown as typeof invoice.voidedBy;
    invoice.voidedAt = new Date();
    if (body.voidReason) invoice.voidReason = body.voidReason;
    // Reverse any pending/approved commissions tied to this invoice
    const voidReversalResult = await reverseCommissionsForInvoice(invoice._id);
    commissionsReversed = voidReversalResult.reversed;
    commissionsAlreadyPaid = voidReversalResult.alreadyPaid;
  }

  if (body.notes !== undefined) {
    invoice.notes = body.notes;
  }
  if (body.internalNotes !== undefined) {
    invoice.internalNotes = body.internalNotes;
  }

  await invoice.save();

  if (body.status === "paid") {
    try {
      const approvedCommissionsResult = await approvePendingCommissionsForPaidInvoice(
        invoice._id,
        ctx.userId,
        { sendNotifications: false },
      );
      commissionsApproved = approvedCommissionsResult.approved;

      if (commissionsApproved > 0) {
        for (const commission of invoice.commissions ?? []) {
          if (commission.status === "pending") {
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

  // Dispatch webhook for paid status
  if (body.status === "paid") {
    dispatchWebhook("invoice.paid", {
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      currency: invoice.currency,
      status: "paid",
      paidAt: invoice.paidAt?.toISOString(),
    });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.update",
    resource: "subscriptions",
    resourceId: invoice._id.toString(),
    changes: { before, after: { status: invoice.status, notes: invoice.notes, internalNotes: invoice.internalNotes } },
    meta: { commissionsCreated, commissionsReversed, commissionsAlreadyPaid, commissionsApproved, commissionNotificationFailures, commissionApprovalFailed, embeddedCommissionSyncFailed },
    req,
  });

  return NextResponse.json({ invoice, commissionsCreated, commissionsReversed, commissionsAlreadyPaid, commissionsApproved, commissionNotificationFailures, commissionApprovalFailed, embeddedCommissionSyncFailed });
}

export const GET = withAuth(getHandler, { resource: "subscriptions", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "subscriptions", action: "update" });
