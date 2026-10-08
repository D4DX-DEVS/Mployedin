/**
 * POST /api/invoices/[id]/verify-payment — Verify/reject an employer's payment notification.
 *
 * Only admin, super_agent, or the assigned agent can verify.
 * On approval the invoice is automatically marked as paid.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { canAccessInvoice } from "@/lib/invoices/access";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { markInvoicePaid } from "@/lib/payments/markInvoicePaid";
import { PAYABLE_INVOICE_STATUSES } from "@/lib/invoices/status";
import { isStaleInvoiceWrite, staleInvoiceResponse } from "@/lib/invoices/concurrency";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import logger from "@/lib/logger";
import type { UserRole } from "@/types/user";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const verifyPaymentSchema = z.object({
  notificationIndex: z.number().int().min(0),
  action: z.enum(["approve", "reject"]),
  notes: z.string().max(500).trim().optional(),
});

async function postHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Only staff can verify payments" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, verifyPaymentSchema);

  // M2 (segregation of duties): approving auto-marks the invoice paid and auto-approves
  // commissions — including the verifying agent's OWN commission. Restrict approval to
  // admin/super_agent; agents may only reject/flag.
  if (body.action === "approve" && !["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Only admin or super-agent can approve payments" }, { status: 403 });
  }

  const invoice = await Invoice.findById(params?.id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!(await canAccessInvoice(ctx, invoice))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const notifications = invoice.paymentNotifications ?? [];
  if (body.notificationIndex >= notifications.length) {
    return NextResponse.json({ error: "Payment notification not found" }, { status: 404 });
  }

  const notification = notifications[body.notificationIndex];
  if (notification.verified) {
    return NextResponse.json({ error: "This payment notification has already been verified" }, { status: 400 });
  }

  const now = new Date();

  if (body.action === "approve") {
    // Mark notification as verified
    notification.verified = true;
    notification.verifiedBy = ctx.userId as unknown as typeof invoice.markedPaidBy;
    notification.verifiedAt = now;

    // Record the remaining balance through the shared payment path — the same
    // rules (payable status, balance cap, commission create+approve, invoice.paid
    // webhook, subscription activation) as a gateway payment. The notification
    // flag above rides along in the same version-checked save.
    const total = invoice.totalAmount || invoice.amount;
    const currentPaid = invoice.paidAmount || 0;
    const remainingBalance = Math.max(0, Math.round((total - currentPaid) * 100) / 100);

    let recorded = false;
    if (remainingBalance > 0 && (PAYABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
      const result = await markInvoicePaid(invoice, {
        provider: "manual",
        paymentId: notification.referenceNumber || "VERIFIED-PAYMENT",
        amount: remainingBalance,
        currency: invoice.currency,
        method: notification.paymentMethod || "bank_transfer",
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        notes: body.notes || `Payment verified by ${ctx.role}`,
        notifyPayer: false,
        audit: false,
      });
      if (result.status === "conflict") return staleInvoiceResponse();
      recorded = result.status === "paid" || result.status === "partially_paid";
    }

    if (!recorded) {
      // Nothing to record (already settled / not payable) — persist the flag alone.
      invoice.increment();
      try {
        await invoice.save();
      } catch (err) {
        if (isStaleInvoiceWrite(err)) return staleInvoiceResponse();
        throw err;
      }
    }

    // Notify the employer
    const employerUserId = typeof invoice.userId === "object" && "_id" in invoice.userId
      ? String((invoice.userId as { _id: unknown })._id)
      : String(invoice.userId);

    await notify({
      userId: employerUserId,
      type: "system",
      title: "Payment Verified",
      message: `Your payment for invoice ${invoice.invoiceNumber} has been verified and approved. You can now download your receipt.`,
      link: `/en/employer/invoices`,
      sendEmail: true,
    }).catch((err: unknown) => logger.warn({ err }, "Payment verification notification failed"));

    await logActivity({
      ...actorFromCtx(ctx),
      action: "invoice.payment_verified",
      resource: "invoices",
      resourceId: String(invoice._id),
      meta: { notificationIndex: body.notificationIndex, paymentMethod: notification.paymentMethod },
      req,
    });

    return NextResponse.json({
      success: true,
      message: "Payment verified and invoice marked as paid",
      invoiceStatus: invoice.status,
    });
  }

  // Reject
  notification.verified = false;
  notification.verifiedBy = ctx.userId as unknown as typeof invoice.markedPaidBy;
  notification.verifiedAt = now;
  if (body.notes) notification.notes = `${notification.notes ?? ""}\nRejected: ${body.notes}`.trim();

  await invoice.save();

  const employerUserId = typeof invoice.userId === "object" && "_id" in invoice.userId
    ? String((invoice.userId as { _id: unknown })._id)
    : String(invoice.userId);

  await notify({
    userId: employerUserId,
    type: "system",
    title: "Payment Not Verified",
    message: `Your payment notification for invoice ${invoice.invoiceNumber} could not be verified. Reason: ${body.notes || "Please contact support."}`,
    link: `/en/employer/invoices`,
    sendEmail: true,
  }).catch((err: unknown) => logger.warn({ err }, "Payment rejection notification failed"));

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.payment_rejected",
    resource: "invoices",
    resourceId: String(invoice._id),
    meta: { notificationIndex: body.notificationIndex, reason: body.notes },
    req,
  });

  return NextResponse.json({
    success: true,
    message: "Payment notification rejected",
    invoiceStatus: invoice.status,
  });
}

export const POST = withAuth(postHandler, { resource: "invoices", action: "read" });
