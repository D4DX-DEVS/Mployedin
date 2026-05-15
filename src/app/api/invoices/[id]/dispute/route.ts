/**
 * POST /api/invoices/[id]/dispute — Raise a billing query / dispute.
 * GET  /api/invoices/[id]/dispute — List disputes for this invoice.
 *
 * Employers can raise disputes; admin/SA can resolve them.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { canAccessInvoice } from "@/lib/invoices/access";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

const DISPUTE_CATEGORIES = ["wrong_amount", "tax_issue", "duplicate", "refund_request", "other"] as const;

const raiseDisputeSchema = z.object({
  reason: z.string().min(3).max(200).trim(),
  category: z.enum(DISPUTE_CATEGORIES).default("other"),
  description: z.string().max(1000).trim().optional().default(""),
});

const resolveDisputeSchema = z.object({
  disputeId: z.string().min(1),
  status: z.enum(["resolved", "rejected"]),
  resolution: z.string().min(1).max(1000).trim(),
});

const MAX_OPEN_DISPUTES_PER_INVOICE = 3;

// ── GET: list disputes ──────────────────────────────────────────────────────
async function getHandler(
  _req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  await connectDB();

  const invoice = await Invoice.findById(params?.id)
    .select("invoiceNumber disputes userId")
    .populate("disputes.raisedBy", "name email")
    .populate("disputes.resolvedBy", "name email")
    .lean();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!(await canAccessInvoice(ctx, invoice))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    invoiceNumber: invoice.invoiceNumber,
    disputes: invoice.disputes ?? [],
  });
}

// ── POST: raise or resolve dispute ──────────────────────────────────────────
async function postHandler(
  req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  await connectDB();

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "raise";

  const invoice = await Invoice.findById(params?.id);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!(await canAccessInvoice(ctx, invoice))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (action === "resolve") {
    // Only admin / super_agent can resolve
    if (!["admin", "super_agent"].includes(ctx.role)) {
      return NextResponse.json({ error: "Only admin or super-agent can resolve disputes" }, { status: 403 });
    }

    const body = await validateBody(req, resolveDisputeSchema);
    const dispute = invoice.disputes?.find(
      (d: { _id?: { toString(): string } }) => d._id?.toString() === body.disputeId,
    );

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    if (dispute.status !== "open" && dispute.status !== "under_review") {
      return NextResponse.json({ error: "Dispute is already resolved or rejected" }, { status: 400 });
    }

    dispute.status = body.status;
    dispute.resolution = body.resolution;
    dispute.resolvedAt = new Date();
    dispute.resolvedBy = ctx.userId;

    await invoice.save();

    await logActivity({
      ...actorFromCtx(ctx),
      action: `invoice.dispute_${body.status}`,
      resource: "subscriptions",
      resourceId: invoice._id.toString(),
      meta: { disputeId: body.disputeId, resolution: body.resolution },
      req,
    });

    return NextResponse.json({ dispute, message: `Dispute ${body.status}` });
  }

  // Default: raise dispute
  const body = await validateBody(req, raiseDisputeSchema);

  // Limit open disputes
  const openCount = (invoice.disputes ?? []).filter(
    (d: { status: string }) => d.status === "open" || d.status === "under_review",
  ).length;

  if (openCount >= MAX_OPEN_DISPUTES_PER_INVOICE) {
    return NextResponse.json({
      error: `Maximum ${MAX_OPEN_DISPUTES_PER_INVOICE} open disputes per invoice. Please wait for existing disputes to be resolved.`,
    }, { status: 400 });
  }

  if (!invoice.disputes) invoice.disputes = [];

  invoice.disputes.push({
    reason: body.reason,
    category: body.category,
    description: body.description ?? "",
    status: "open",
    raisedAt: new Date(),
    raisedBy: ctx.userId,
  });

  await invoice.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.dispute_raised",
    resource: "subscriptions",
    resourceId: invoice._id.toString(),
    meta: { reason: body.reason, category: body.category },
    req,
  });

  return NextResponse.json({
    message: "Billing query submitted. Our team will review and respond.",
    dispute: invoice.disputes[invoice.disputes.length - 1],
  }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "subscriptions", action: "read" });
export const POST = withAuth(postHandler, { resource: "subscriptions", action: "update" });
