/**
 * POST /api/invoices/[id]/credit-note — Issue a credit note / refund against an invoice.
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import type { UserRole } from "@/types/user";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const creditNoteSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  reason: z.string().min(1).max(500),
  notes: z.string().max(1000).optional(),
});

async function postHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, creditNoteSchema);

  const invoice = await Invoice.findById(params?.id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (["void", "cancelled"].includes(invoice.status)) {
    return NextResponse.json({ error: `Cannot issue credit note for ${invoice.status} invoice` }, { status: 400 });
  }

  const maxRefundable = invoice.totalAmount - (invoice.refundedAmount || 0);
  if (body.amount > maxRefundable) {
    return NextResponse.json({
      error: `Refund amount exceeds maximum refundable amount of ${maxRefundable}`,
    }, { status: 400 });
  }

  // Create credit note invoice
  const creditNoteNumber = await generateInvoiceNumber();
  const creditNote = await Invoice.create({
    invoiceNumber: creditNoteNumber,
    category: invoice.category,
    userId: invoice.userId,
    jobId: invoice.jobId,
    employerId: invoice.employerId,
    agentId: invoice.agentId,
    type: invoice.type,
    description: `Credit note for ${invoice.invoiceNumber}: ${body.reason}`,
    lineItems: [{ description: `Credit note — ${body.reason}`, quantity: 1, unitPrice: -body.amount, amount: -body.amount }],
    subtotal: -body.amount,
    totalAmount: -body.amount,
    amount: -body.amount,
    currency: invoice.currency,
    billingDetails: invoice.billingDetails,
    status: "credit_note",
    issuedAt: new Date(),
    notes: body.notes,
    creditNoteNumber,
    parentInvoiceId: invoice._id,
    createdBy: ctx.userId,
  });

  // Update original invoice
  invoice.refundedAmount = (invoice.refundedAmount || 0) + body.amount;
  if (invoice.refundedAmount >= invoice.totalAmount) {
    invoice.status = "refunded";
  }
  await invoice.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.credit_note",
    resource: "subscriptions",
    resourceId: String(invoice._id),
    meta: {
      creditNoteId: String(creditNote._id),
      creditNoteNumber,
      amount: body.amount,
      reason: body.reason,
    },
    req,
  });

  dispatchWebhook("invoice.credit_note", {
    invoiceId: String(invoice._id),
    creditNoteId: String(creditNote._id),
    creditNoteNumber,
    amount: body.amount,
    currency: invoice.currency,
  });

  return NextResponse.json({
    creditNote,
    updatedInvoice: {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      refundedAmount: invoice.refundedAmount,
      status: invoice.status,
    },
    message: `Credit note ${creditNoteNumber} issued for ${invoice.currency} ${body.amount}`,
  }, { status: 201 });
}

export const POST = withAuth(postHandler, { resource: "subscriptions", action: "update" });
