/**
 * GET  /api/subscriptions/[id]  — Get subscription by ID
 * PATCH /api/subscriptions/[id] — Cancel subscription OR toggle auto-renew
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { Employer } from "@/models/Employer";
import type { UserRole } from "@/types/user";
import { z } from "zod";

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

// ── PATCH (Cancel OR Toggle Auto-Renew) ──────────────────────────────────────
async function patchHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  await connectDB();

  const raw = await req.json();

  // ── Auto-Renew Toggle ─────────────────────────────────────────
  if ("autoRenew" in raw) {
    const parsed = z.object({ autoRenew: z.boolean() }).safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid autoRenew value" }, { status: 400 });
    }

    const sub = await Subscription.findById(params?.id);
    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    // Owner or admin can toggle
    const isAdmin = ["admin", "super_agent", "agent"].includes(ctx.role);
    if (!isAdmin && sub.userId.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (sub.status !== "active") {
      return NextResponse.json(
        { error: `Cannot update a subscription with status "${sub.status}"` },
        { status: 400 },
      );
    }

    sub.autoRenew = parsed.data.autoRenew;
    await sub.save();

    await logActivity({
      ...actorFromCtx(ctx),
      action: "subscription.autoRenew",
      resource: "subscriptions",
      resourceId: sub._id.toString(),
      meta: { autoRenew: parsed.data.autoRenew },
      req,
    });

    return NextResponse.json({ subscription: sub });
  }

  // ── Cancel ────────────────────────────────────────────────────
  // Only admin/super_agent can cancel
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cancelParsed = z.object({ reason: z.string().max(500).trim().optional() }).safeParse(raw);
  if (!cancelParsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const body = cancelParsed.data;

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

  // Backward compat — reset legacy plan flags so premium feature gates
  // (e.g. SMTP override) and UI badges don't show a stale "premium" plan.
  if (sub.targetRole === "employer") {
    await Employer.findOneAndUpdate(
      { userId: sub.userId },
      { paymentStatus: "pending", subscriptionType: "basic" },
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
