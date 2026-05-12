/**
 * GET   /api/invoices/[id] — Get single invoice (IDOR-protected)
 * PATCH /api/invoices/[id] — Mark paid/void (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { invoiceUpdateSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

// ── GET ──────────────────────────────────────────────────────────────────────
async function getHandler(
  _req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  await connectDB();
  const invoice = await Invoice.findById(params?.id).lean();
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // IDOR: non-staff can only view own
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    if (invoice.userId.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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

  // Cannot modify already-void invoices
  if (invoice.status === "void") {
    return NextResponse.json(
      { error: "Cannot modify a voided invoice" },
      { status: 400 },
    );
  }

  const before = { status: invoice.status, notes: invoice.notes };

  if (body.status === "paid") {
    invoice.status = "paid";
    invoice.paidAt = new Date();
    invoice.markedPaidBy = ctx.userId as unknown as typeof invoice.markedPaidBy;
  } else if (body.status === "void") {
    invoice.status = "void";
  }

  if (body.notes !== undefined) {
    invoice.notes = body.notes;
  }

  await invoice.save();

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
    changes: { before, after: { status: invoice.status, notes: invoice.notes } },
    req,
  });

  return NextResponse.json({ invoice });
}

export const GET = withAuth(getHandler, { resource: "subscriptions", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "subscriptions", action: "update" });
