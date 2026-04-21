/**
 * GET  /api/subscriptions/[id]  — Get subscription by ID
 * PATCH /api/subscriptions/[id] — Cancel subscription
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { subscriptionCancelSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { Employer } from "@/models/Employer";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

// ── GET ──────────────────────────────────────────────────────────────────────
async function getHandler(
  _req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  await connectDB();
  const sub = await Subscription.findById(params?.id).lean();
  if (!sub) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  // IDOR: non-admin can only view own
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    if (sub.userId.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ subscription: sub });
}

// ── PATCH (Cancel) ───────────────────────────────────────────────────────────
async function patchHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  // Only admin/super_agent can cancel
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, subscriptionCancelSchema);

  const sub = await Subscription.findById(params?.id);
  if (!sub) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }
  if (sub.status !== "active") {
    return NextResponse.json(
      { error: `Cannot cancel a subscription with status "${sub.status}"` },
      { status: 400 },
    );
  }

  const now = new Date();
  sub.status = "cancelled";
  sub.cancelledAt = now;
  sub.cancelledBy = ctx.userId as unknown as typeof sub.cancelledBy;
  sub.cancellationReason = body.reason;
  await sub.save();

  // History
  await SubscriptionHistory.create({
    userId: sub.userId,
    subscriptionId: sub._id,
    action: "cancelled",
    fromPlanId: sub.planId,
    fromPlanName: sub.planSnapshot?.name,
    performedBy: ctx.userId,
    performedByRole: ctx.role,
    reason: body.reason,
  });

  // Backward compat
  if (sub.targetRole === "employer") {
    await Employer.findOneAndUpdate(
      { userId: sub.userId },
      { paymentStatus: "pending" },
    );
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "subscription.cancel",
    resource: "subscriptions",
    resourceId: sub._id.toString(),
    meta: { userId: sub.userId.toString(), reason: body.reason },
    req,
  });

  return NextResponse.json({ subscription: sub });
}

export const GET = withAuth(getHandler, {
  resource: "subscriptions",
  action: "read",
});

export const PATCH = withAuth(patchHandler, {
  resource: "subscriptions",
  action: "update",
});
