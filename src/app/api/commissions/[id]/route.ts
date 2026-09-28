import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { commissionUpdateSchema } from "@/lib/validators/commissions";
import { isValidObjectId } from "@/lib/security/sanitize";
import { canAccess } from "@/lib/permissions/matrix";
import { commissionBeneficiary, isOwnCommissionLine, resolveCommissionApprover } from "@/lib/invoices/commissionRecords";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import { notifyCommissionApproved, notifyCommissionPaid } from "@/lib/notifications/trigger";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";

/**
 * The user who earns this line — the agent on a placement, the super-agent on
 * an override. Only they are told it was approved or paid; the super-agent
 * named on an agent's placement line merely oversees it.
 */
async function beneficiaryUser(
  line: { agentId?: unknown; superAgentId?: unknown; type?: unknown },
): Promise<{ userId: string; role: "agent" | "super_agent" } | null> {
  const earner = commissionBeneficiary(line);
  if (!earner) return null;
  const profile = earner.role === "agent"
    ? await Agent.findById(earner.profileId).select("userId").lean()
    : await SuperAgent.findById(earner.profileId).select("userId").lean();
  return profile?.userId ? { userId: String(profile.userId), role: earner.role } : null;
}

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function toComparableId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "object" && "_id" in value) {
    const entity = value as { _id?: unknown };
    return entity._id ? String(entity._id) : null;
  }
  return String(value);
}

async function canAccessCommission(
  ctx: AuthCtx,
  commission: { agentId?: unknown; superAgentId?: unknown },
): Promise<boolean> {
  if (ctx.role === "admin") return true;

  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    return Boolean(agent?._id && toComparableId(commission.agentId) === String(agent._id));
  }

  if (ctx.role === "super_agent") {
    const superAgent = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    return Boolean(superAgent?._id && toComparableId(commission.superAgentId) === String(superAgent._id));
  }

  return false;
}

/** Where each status may go next through this route. */
const NEXT_STATUSES: Record<string, string[]> = {
  pending: ["approved", "disputed"],
  approved: ["paid", "disputed"],
  paid: ["disputed", "clawed_back"],
  // Resolve returns it to where it was; a paid line under dispute may be clawed back.
  disputed: ["clawed_back"],
  clawed_back: [],
};
const STATUS_WORDS: Record<string, string> = {
  pending: "pending", approved: "approved", paid: "paid", disputed: "disputed", clawed_back: "clawed-back",
};

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const commission = await Commission.findById(params?.id)
    .populate({ path: "agentId", select: "userId", populate: { path: "userId", select: "name" } })
    .populate("placementId", "jobTitle candidateName")
    .lean();
  if (!commission) return NextResponse.json({ error: "Commission not found" }, { status: 404 });
  if (!(await canAccessCommission(ctx, commission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ commission });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const commission = await Commission.findById(params?.id);
  if (!commission) return NextResponse.json({ error: "Commission not found" }, { status: 404 });

  if (!(await canAccessCommission(ctx, commission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, commissionUpdateSchema);

  // Approval vs financial edit are different privileges. The route guard is
  // commissions:update, which super_agent does not hold — so its whole commission
  // approval flow (the super-agent commissions page) used to 403, even though the
  // matrix grants it commissions:approve and no route consumed that grant.
  //
  // Rather than widening super_agent to full update (which would let it rewrite
  // amount and rate), an approve-only role may move a commission to approved or
  // disputed and annotate it; changing money, or settling it as paid/clawed_back,
  // still requires commissions:update.
  const FINANCIAL_FIELDS = ["amount", "rate", "currency", "type", "paymentRef", "paymentMethod", "paidAt", "clawbackAmount"] as const;
  const SETTLEMENT_STATUSES = ["paid", "clawed_back"];
  const mayUpdate = canAccess(ctx.role, "commissions", "update");
  if (!mayUpdate) {
    const touchesMoney = FINANCIAL_FIELDS.some((f) => body[f] !== undefined);
    const settles = body.status !== undefined && SETTLEMENT_STATUSES.includes(body.status);
    if (touchesMoney || settles || !canAccess(ctx.role, "commissions", "approve")) {
      return NextResponse.json(
        { error: "Forbidden — approving a commission does not permit editing or settling it" },
        { status: 403 },
      );
    }
  }

  // Segregation of duties: nobody advances their OWN commission toward payment.
  // canAccessCommission deliberately grants an agent/super-agent access to the
  // line they earn (so they can read and dispute it), which makes this route a
  // direct bypass of the self-approval exclusion applied when an invoice is
  // marked paid — approve it here and the next payout batch pays it out.
  // Disputing your own line is still allowed; only advancing it is not.
  const SELF_ADVANCING_STATUSES = ["approved", "paid"];
  if (body.status !== undefined && SELF_ADVANCING_STATUSES.includes(body.status)) {
    const approver = await resolveCommissionApprover(ctx.userId);
    if (isOwnCommissionLine(commission, approver)) {
      return NextResponse.json(
        { error: "You cannot approve or settle your own commission — an admin must review it." },
        { status: 403 },
      );
    }
  }

  // Allowed moves. A line cannot skip approval, a clawed-back line is final, and
  // a dispute ends through Resolve (disputeResolution), not a status jump.
  if (body.status !== undefined && body.status !== commission.status) {
    const allowed = NEXT_STATUSES[commission.status] ?? [];
    const clawingBackUnpaid = body.status === "clawed_back" && !commission.paidAt;
    if (!allowed.includes(body.status) || clawingBackUnpaid) {
      return NextResponse.json(
        { error: `A ${STATUS_WORDS[commission.status] ?? commission.status} commission can't be marked ${STATUS_WORDS[body.status] ?? body.status}.` },
        { status: 422 },
      );
    }
  }
  if (body.disputeResolution && commission.status !== "disputed") {
    return NextResponse.json({ error: "Only a disputed commission can be resolved." }, { status: 422 });
  }

  // Guard: block financial field edits on finalized (approved/paid) commissions
  const LOCKED_STATUSES = ["approved", "paid"] as const;
  if (
    LOCKED_STATUSES.includes(commission.status as (typeof LOCKED_STATUSES)[number]) &&
    (body.amount !== undefined || body.rate !== undefined)
  ) {
    return NextResponse.json(
      { error: "Cannot edit amount or rate on an approved or paid commission. Dispute or clawback first." },
      { status: 422 },
    );
  }

  // An invoice-generated line's money comes from its invoice. Editing it here
  // left the invoice's own copy of the line (invoice.commissions[]) saying
  // something else; corrections go through Dispute or Clawback.
  const INVOICE_OWNED_FIELDS = ["amount", "rate", "currency", "type"] as const;
  if (commission.invoiceId && INVOICE_OWNED_FIELDS.some((f) => body[f] !== undefined)) {
    return NextResponse.json(
      { error: "This commission comes from an invoice, so its amount, rate, currency and type can't be edited. Use Dispute or Clawback instead." },
      { status: 422 },
    );
  }

  // A payout needs a trail: the reference of the transfer, cheque or receipt.
  const paying = body.status === "paid" && commission.status !== "paid";
  if (paying) {
    if (!(body.paymentRef ?? commission.paymentRef ?? "").trim()) {
      return NextResponse.json(
        { error: "Enter the payment reference, such as the bank transfer ID, cheque number or receipt number." },
        { status: 422 },
      );
    }
    // A day's grace absorbs the admin's timezone being ahead of the server's.
    if (body.paidAt && new Date(`${body.paidAt}T00:00:00Z`).getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "The payment date can't be in the future." }, { status: 422 });
    }
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) update[k] = v;

  // Auto-track approval
  if (body.status === "approved" && commission.status !== "approved") {
    update.approvedBy = ctx.userId;
    update.approvedAt = new Date();
  }
  if (paying) {
    // Noon UTC keeps the chosen day the same day in every timezone.
    update.paidAt = body.paidAt ? new Date(`${body.paidAt}T12:00:00Z`) : new Date();
    update.paidBy = ctx.userId;
  } else {
    delete update.paidAt;
  }

  // Auto-track dispute. A new dispute clears the last one's resolution, or it
  // could never be resolved (resolution used to be recorded only once).
  if (body.status === "disputed" && commission.status !== "disputed") {
    update.disputedBy = ctx.userId;
    update.disputedAt = new Date();
    update.disputeResolution = undefined;
    update.resolvedBy = undefined;
    update.resolvedAt = undefined;
  }

  // Auto-track dispute resolution. Resolved and rejected both close the dispute;
  // escalated keeps it open, so it is not stamped as resolved.
  const closesDispute = body.disputeResolution === "resolved" || body.disputeResolution === "rejected";
  if (closesDispute) {
    update.resolvedBy = ctx.userId;
    update.resolvedAt = new Date();
    // If dispute is resolved, revert status back to the pre-dispute status.
    // A previously-paid commission must return to "paid" — never "approved" —
    // otherwise the next payout batch (which matches status:"approved") would
    // pay it a second time with a fresh paymentRef (double payout).
    if (!body.status) {
      update.status = commission.paidAt
        ? "paid"
        : commission.approvedAt
          ? "approved"
          : "pending";
    }
  }

  // Auto-track clawback
  if (body.status === "clawed_back" && commission.status !== "clawed_back") {
    update.clawbackBy = ctx.userId;
    update.clawbackAt = new Date();
    if (!update.clawbackAmount) update.clawbackAmount = commission.amount;
  }

  Object.assign(commission, update);
  await commission.save();

  // Dispatch webhook for status changes
  if (body.status === "approved") {
    dispatchWebhook("commission.approved", {
      commissionId: params?.id,
      amount: commission.amount,
      currency: commission.currency,
      status: "approved",
    });
    const earner = await beneficiaryUser(commission);
    if (earner) {
      notifyCommissionApproved(earner.userId, earner.role, commission.amount, commission.currency).catch((err) => { logger.error({ err, commissionId: params?.id, role: earner.role }, "failed to notify earner of commission approval"); });
    }
  } else if (body.status === "paid") {
    dispatchWebhook("commission.paid", {
      commissionId: params?.id,
      amount: commission.amount,
      currency: commission.currency,
      status: "paid",
      paidAt: commission.paidAt?.toISOString(),
      paymentRef: commission.paymentRef,
    });
    const earner = await beneficiaryUser(commission);
    if (earner) {
      notifyCommissionPaid(earner.userId, earner.role, commission.amount, commission.currency, commission.paymentRef ?? "—").catch((err) => { logger.error({ err, commissionId: params?.id, role: earner.role }, "failed to notify earner of commission payment"); });
    }
  } else if (body.status === "disputed") {
    dispatchWebhook("commission.disputed", {
      commissionId: params?.id,
      amount: commission.amount,
      currency: commission.currency,
      status: "disputed",
      disputeReason: body.disputeReason,
    });
  } else if (body.status === "clawed_back") {
    dispatchWebhook("commission.clawed_back", {
      commissionId: params?.id,
      amount: commission.amount,
      currency: commission.currency,
      clawbackAmount: commission.clawbackAmount ?? commission.amount,
      clawbackReason: body.clawbackReason,
      status: "clawed_back",
    });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "commission.update",
    resource: "commissions",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ commission });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const commission = await Commission.findById(params?.id);
  if (!commission) return NextResponse.json({ error: "Commission not found" }, { status: 404 });

  // IDOR: only admins can delete commissions
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // An invoice's commission goes when the invoice is voided or cancelled
  // (reverseCommissionsForInvoice) — deleting it here left the invoice still
  // counting it. Money already paid out is recovered with a clawback instead.
  if (commission.invoiceId) {
    return NextResponse.json(
      { error: "This commission comes from an invoice. Void or cancel the invoice to remove it." },
      { status: 409 },
    );
  }
  // paidAt stays set through a later dispute, so it — not status — says money went out.
  if (commission.paidAt || commission.status === "paid" || commission.status === "clawed_back") {
    return NextResponse.json(
      { error: "A paid commission can't be deleted. Use Clawback to recover the money." },
      { status: 409 },
    );
  }

  await Commission.findByIdAndDelete(params?.id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "commission.delete",
    resource: "commissions",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Commission deleted" });
}

export const GET = withAuth(getHandler, { resource: "commissions", action: "read" });
// Guarded on "read", not "update": approve-only roles (super_agent) must reach the
// handler, which then splits approval from financial edits. Ownership is enforced
// by canAccessCommission, and roles without any commissions permission are still
// rejected by this guard.
export const PATCH = withAuth(patchHandler, { resource: "commissions", action: "read" });
export const DELETE = withAuth(deleteHandler, { resource: "commissions", action: "delete" });
