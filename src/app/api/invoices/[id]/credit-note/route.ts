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

  // Reserve the amount in one conditional update. Reading the refunded total
  // and saving it back let two credit notes issued at once both pass the check
  // and together refund more than the invoice (audit FUNC-011).
  const reserved = await Invoice.findOneAndUpdate(
    {
      _id: invoice._id,
      status: { $nin: ["void", "cancelled"] },
      $expr: { $lte: [{ $add: [{ $ifNull: ["$refundedAmount", 0] }, body.amount] }, "$totalAmount"] },
    },
    { $inc: { refundedAmount: body.amount } },
    { new: true },
  );
  if (!reserved) {
    const fresh = (await Invoice.findById(invoice._id)) ?? invoice;
    const maxRefundable = fresh.totalAmount - (fresh.refundedAmount || 0);
    return NextResponse.json({
      error: `Refund amount exceeds maximum refundable amount of ${maxRefundable}`,
    }, { status: 400 });
  }

  // Create credit note invoice; if that fails, give the reservation back.
  const creditNoteNumber = await generateInvoiceNumber();
  let creditNote;
  try {
    creditNote = await Invoice.create({
      invoiceNumber: creditNoteNumber,
      category: invoice.category,
      userId: invoice.userId,
      jobId: invoice.jobId,
      employerId: invoice.employerId,
      agentId: invoice.agentId,
      type: invoice.type,
      description: `Credit note for ${invoice.invoiceNumber}: ${body.reason}`,
      lineItems: [{ description: `Credit note — ${body.reason}`, quantity: 1, unitPrice: body.amount, amount: body.amount }],
      subtotal: body.amount,
      totalAmount: body.amount,
      amount: body.amount,
      currency: invoice.currency,
      billingDetails: invoice.billingDetails,
      status: "credit_note",
      issuedAt: new Date(),
      notes: body.notes,
      creditNoteNumber,
      parentInvoiceId: invoice._id,
      createdBy: ctx.userId,
    });
  } catch (err) {
    await Invoice.updateOne({ _id: invoice._id }, { $inc: { refundedAmount: -body.amount } });
    throw err;
  }

  // Fully refunded once the reserved total reaches the invoice total.
  let status = reserved.status;
  if (reserved.refundedAmount >= reserved.totalAmount && status !== "refunded") {
    await Invoice.updateOne({ _id: invoice._id, status: { $nin: ["void", "cancelled"] } }, { $set: { status: "refunded" } });
    status = "refunded";
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.credit_note",
    resource: "invoices",
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
      refundedAmount: reserved.refundedAmount,
      status,
    },
    message: `Credit note ${creditNoteNumber} issued for ${invoice.currency} ${body.amount}`,
  }, { status: 201 });
}

export const POST = withAuth(postHandler, { resource: "invoices", action: "update" });
