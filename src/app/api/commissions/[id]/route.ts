import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { commissionUpdateSchema } from "@/lib/validators/commissions";
import { isValidObjectId } from "@/lib/security/sanitize";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import { notifyCommissionApproved, notifyCommissionPaid } from "@/lib/notifications/trigger";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/models/User";

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
    .populate("agentId", "fullName")
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
    // If dispute is resolved, revert status back to the pre-dispute status
    if (body.disputeResolution === "resolved" && !body.status) {
      update.status = commission.approvedAt ? "approved" : "pending";
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
        notifyCommissionApproved(String(agent.userId), "agent", commission.amount, commission.currency).catch(() => {});
      }
    }
    if (commission.superAgentId) {
      const sa = await SuperAgent.findById(commission.superAgentId).select("userId").lean();
      if (sa?.userId) {
        notifyCommissionApproved(String(sa.userId), "super_agent", commission.amount, commission.currency).catch(() => {});
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
        notifyCommissionPaid(String(agent.userId), "agent", commission.amount, commission.currency, commission.paymentRef ?? "—").catch(() => {});
      }
    }
    if (commission.superAgentId) {
      const sa = await SuperAgent.findById(commission.superAgentId).select("userId").lean();
      if (sa?.userId) {
        notifyCommissionPaid(String(sa.userId), "super_agent", commission.amount, commission.currency, commission.paymentRef ?? "—").catch(() => {});
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
export const PATCH = withAuth(patchHandler, { resource: "commissions", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "commissions", action: "delete" });
