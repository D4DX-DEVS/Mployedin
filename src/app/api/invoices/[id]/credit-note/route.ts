/**
 * POST /api/invoices/[id]/credit-note — Issue a credit note / refund against an invoice.
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import type { UserRole } from "@/types/user";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import { issueCreditNote, CreditNoteError } from "@/lib/invoices/creditNote";

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

  let result;
  try {
    result = await issueCreditNote(invoice, {
      amount: body.amount,
      reason: body.reason,
      notes: body.notes,
      actorUserId: ctx.userId,
    });
  } catch (err) {
    if (err instanceof CreditNoteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const { creditNote, creditNoteNumber, commissionClawback } = result;

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
      commissionsClawedBack: commissionClawback.clawedBack,
      commissionsAnnotated: commissionClawback.annotated,
    },
    req,
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

export const POST = withAuth(postHandler, { resource: "invoices", action: "update" });
