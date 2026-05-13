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
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

// ── GET: list payments ──────────────────────────────────────────────────────
async function getHandler(
  _req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  await connectDB();
  const invoice = await Invoice.findById(params?.id)
    .select("invoiceNumber payments paidAmount balanceDue totalAmount currency status")
    .populate("payments.recordedBy", "name email")
    .lean();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
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

  // Cannot pay void/cancelled/refunded invoices
  if (["void", "cancelled", "refunded"].includes(invoice.status)) {
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

  // Pre-save hook will recalculate paidAmount, balanceDue, and status
  await invoice.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.payment_recorded",
    resource: "subscriptions",
    resourceId: invoice._id.toString(),
    meta: {
      paymentAmount: body.amount,
      paymentMethod: body.paymentMethod,
      newPaidAmount: invoice.paidAmount,
      newBalance: invoice.balanceDue,
      newStatus: invoice.status,
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
    },
  });
}

export const GET = withAuth(getHandler, { resource: "subscriptions", action: "read" });
export const POST = withAuth(postHandler, { resource: "subscriptions", action: "update" });
