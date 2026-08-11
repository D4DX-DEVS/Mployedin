import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { commissionUpdateSchema } from "@/lib/validators/commissions";
import { isValidObjectId } from "@/lib/security/sanitize";
import { canAccess } from "@/lib/permissions/matrix";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import { notifyCommissionApproved, notifyCommissionPaid } from "@/lib/notifications/trigger";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";

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
  const FINANCIAL_FIELDS = ["amount", "rate", "currency", "type", "paymentRef", "clawbackAmount"] as const;
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

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) update[k] = v;

  // Auto-track approval
  if (body.status === "approved" && commission.status !== "approved") {
    update.approvedBy = ctx.userId;
    update.approvedAt = new Date();
  }
  if (body.status === "paid" && commission.status !== "paid") {
    update.paidAt = new Date();
  }

  // Auto-track dispute
  if (body.status === "disputed" && commission.status !== "disputed") {
    update.disputedBy = ctx.userId;
    update.disputedAt = new Date();
  }

  // Auto-track dispute resolution
  if (body.disputeResolution && !commission.resolvedAt) {
    update.resolvedBy = ctx.userId;
    update.resolvedAt = new Date();
    // If dispute is resolved, revert status back to the pre-dispute status.
    // A previously-paid commission must return to "paid" — never "approved" —
    // otherwise the next payout batch (which matches status:"approved") would
    // pay it a second time with a fresh paymentRef (double payout).
    if (body.disputeResolution === "resolved" && !body.status) {
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
    // Notify agent/super-agent about approval
    if (commission.agentId) {
      const agent = await Agent.findById(commission.agentId).select("userId").lean();
      if (agent?.userId) {
        notifyCommissionApproved(String(agent.userId), "agent", commission.amount, commission.currency).catch((err) => { logger.error({ err, commissionId: params?.id, role: "agent" }, "failed to notify agent of commission approval"); });
      }
    }
    if (commission.superAgentId) {
      const sa = await SuperAgent.findById(commission.superAgentId).select("userId").lean();
      if (sa?.userId) {
        notifyCommissionApproved(String(sa.userId), "super_agent", commission.amount, commission.currency).catch((err) => { logger.error({ err, commissionId: params?.id, role: "super_agent" }, "failed to notify super-agent of commission approval"); });
      }
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
    // Notify agent/super-agent about payment
    if (commission.agentId) {
      const agent = await Agent.findById(commission.agentId).select("userId").lean();
      if (agent?.userId) {
        notifyCommissionPaid(String(agent.userId), "agent", commission.amount, commission.currency, commission.paymentRef ?? "—").catch((err) => { logger.error({ err, commissionId: params?.id, role: "agent" }, "failed to notify agent of commission payment"); });
      }
    }
    if (commission.superAgentId) {
      const sa = await SuperAgent.findById(commission.superAgentId).select("userId").lean();
      if (sa?.userId) {
        notifyCommissionPaid(String(sa.userId), "super_agent", commission.amount, commission.currency, commission.paymentRef ?? "—").catch((err) => { logger.error({ err, commissionId: params?.id, role: "super_agent" }, "failed to notify super-agent of commission payment"); });
      }
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
