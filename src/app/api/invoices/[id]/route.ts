/**
 * GET   /api/invoices/[id] — Get single invoice (IDOR-protected)
 * PATCH /api/invoices/[id] — Update invoice status / notes (admin/super_agent)
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { invoiceUpdateSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { canAccessInvoice } from "@/lib/invoices/access";
import {
  approvePendingCommissionsForPaidInvoice,
  createCommissionRecordsForInvoice,
  reverseCommissionsForInvoice,
  sendCommissionApprovalNotifications,
} from "@/lib/invoices/commissionRecords";
import { PAYABLE_INVOICE_STATUSES } from "@/lib/invoices/status";
import { resolveCommissionRate, resolveOverrideRate } from "@/lib/commissions/resolveRate";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import connectDB from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import Invoice from "@/models/Invoice";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Employer from "@/models/Employer";
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
    .populate("createdBy", "name role")
    .populate("payments.recordedBy", "name email")
    .lean();
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Resolve sender context (role label + region for super_agent/agent)
  let senderContext: { name: string; role: string; label: string } | null = null;
  const createdByUser = invoice.createdBy as unknown as { _id: unknown; name?: string; role?: string } | null;
  if (createdByUser?.name && createdByUser?.role) {
    let label = "Mployedin Admin";
    if (createdByUser.role === "super_agent") {
      const saProfile = await SuperAgent.findOne({ userId: createdByUser._id })
        .select("assignedCityIds")
        .populate("assignedCityIds", "name")
        .lean();
      const cityNames = ((saProfile?.assignedCityIds ?? []) as unknown as Array<{ name?: string }>)
        .map(c => c.name).filter(Boolean).slice(0, 3);
      label = cityNames.length > 0
        ? `Super Agent — ${cityNames.join(", ")} region`
        : "Super Agent";
    } else if (createdByUser.role === "agent") {
      const agentProfile = await Agent.findOne({ userId: createdByUser._id })
        .select("assignedCityIds superAgentId")
        .populate("assignedCityIds", "name")
        .lean();
      const cityNames = ((agentProfile?.assignedCityIds ?? []) as unknown as Array<{ name?: string }>)
        .map(c => c.name).filter(Boolean).slice(0, 3);
      label = cityNames.length > 0
        ? `Agent — ${cityNames.join(", ")} region`
        : "Agent";
    }
    senderContext = { name: createdByUser.name, role: createdByUser.role, label };
  }

  return NextResponse.json({ invoice, senderContext });
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

      // Re-resolve commission rates at approval time to prevent rate drift
      if (invoice.agentId) {
        const agentDoc = await Agent.findById(invoice.agentId).lean();
        const superAgentDoc = agentDoc?.superAgentId
          ? await SuperAgent.findById(agentDoc.superAgentId).lean()
          : null;
        const employer = invoice.employerId
          ? await Employer.findById(invoice.employerId).select("country").lean()
          : null;
        const employerCountry = employer?.country ?? null;
        const billedTotal = invoice.totalAmount || invoice.amount;

        for (const commission of invoice.commissions ?? []) {
          if (commission.role === "agent" && agentDoc) {
            const resolved = await resolveCommissionRate(agentDoc.commissionRate, employerCountry);
            commission.rate = resolved.rate;
            commission.amount = Math.round((billedTotal * resolved.rate) / 100 * 100) / 100;
            if (resolved.source === "country_override") {
              commission.notes = `Agent placement commission [Country override: ${resolved.countryCode} → ${resolved.rate}%]`;
            }
          } else if (commission.role === "super_agent" && superAgentDoc) {
            const resolved = await resolveOverrideRate(superAgentDoc.overrideRate, employerCountry);
            commission.rate = resolved.rate;
            commission.amount = Math.round((billedTotal * resolved.rate) / 100 * 100) / 100;
            if (resolved.source === "country_override") {
              commission.notes = `Super-agent override commission [Country override: ${resolved.countryCode} → ${resolved.rate}%]`;
            }
          }
        }

        // Validate combined rate after re-resolution doesn't exceed 100%
        const combinedRate = (invoice.commissions ?? []).reduce((sum: number, c: { rate: number }) => sum + c.rate, 0);
        if (combinedRate > 100) {
          logger.warn({
            invoiceId: String(invoice._id),
            combinedRate,
            agentRate: agentDoc?.commissionRate,
            superAgentRate: superAgentDoc?.overrideRate,
            country: employerCountry,
          }, "Commission rates exceed 100% after re-resolution at approval");
          return NextResponse.json({
            error: `Cannot approve: re-resolved commission rates total ${combinedRate.toFixed(1)}% which exceeds 100%. Please adjust agent/super-agent rates first.`,
          }, { status: 400 });
        }
      }
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

  if (body.status === "paid") {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await invoice.save({ session });

        const approvedCommissionsResult = await approvePendingCommissionsForPaidInvoice(
          invoice._id,
          ctx.userId,
          { sendNotifications: false, session },
        );
        commissionsApproved = approvedCommissionsResult.approved;

        if (commissionsApproved > 0) {
          for (const commission of invoice.commissions ?? []) {
            if (commission.status === "pending") {
              commission.status = "approved";
            }
          }
          await invoice.save({ session });
        }

        // Send notifications outside transaction (non-critical, fire-and-forget)
        if (commissionsApproved > 0) {
          try {
            commissionNotificationFailures = await sendCommissionApprovalNotifications(
              approvedCommissionsResult.notifications,
            );
          } catch (err) {
            logger.error({ err, invoiceId: String(invoice._id) }, "Commission approval notifications failed");
            commissionNotificationFailures = approvedCommissionsResult.notifications.length;
          }
        }
      });
    } catch (err) {
      logger.error({ err, invoiceId: String(invoice._id) }, "Commission approval transaction failed after invoice payment");
      commissionApprovalFailed = true;
    } finally {
      session.endSession();
    }
  } else {
    await invoice.save();
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
    meta: { commissionsCreated, commissionsReversed, commissionsAlreadyPaid, commissionsApproved, commissionNotificationFailures, commissionApprovalFailed },
    req,
  });

  return NextResponse.json({ invoice, commissionsCreated, commissionsReversed, commissionsAlreadyPaid, commissionsApproved, commissionNotificationFailures, commissionApprovalFailed });
}

export const GET = withAuth(getHandler, { resource: "subscriptions", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "subscriptions", action: "update" });
