/**
 * POST /api/invoices/[id]/resubmit — send a draft back for approval.
 *
 * An agent's invoice that a super agent or admin sent back (status "draft",
 * returnReason set) is fixed by the agent and resubmitted here. Agents hold
 * only invoices:create in the permission matrix, so this is its own route
 * rather than a widening of PATCH /api/invoices/[id] (which stays approver-only).
 * The caller must be able to access the invoice (lib/invoices/access): an
 * agent only their own invoices.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { canAccessInvoice } from "@/lib/invoices/access";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const invoice = await Invoice.findById(params?.id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (!(await canAccessInvoice(ctx, invoice))) {
    await logActivity({
      ...actorFromCtx(ctx),
      action: "invoice.access_denied",
      resource: "invoices",
      resourceId: String(invoice._id),
      meta: { operation: "RESUBMIT", invoiceAgentId: String(invoice.agentId ?? "") },
      req,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (invoice.status !== "draft") {
    return NextResponse.json({ error: "Only a draft invoice can be sent for approval" }, { status: 400 });
  }

  invoice.status = "pending_approval";
  await invoice.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.resubmit",
    resource: "invoices",
    resourceId: String(invoice._id),
    changes: { before: { status: "draft" }, after: { status: "pending_approval" } },
    meta: { previousReturnReason: invoice.returnReason ?? null },
    req,
  });

  return NextResponse.json({ invoice: { _id: invoice._id, invoiceNumber: invoice.invoiceNumber, status: invoice.status } });
}

export const POST = withAuth(postHandler, { resource: "invoices", action: "create" });
