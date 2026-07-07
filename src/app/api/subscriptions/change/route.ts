/**
 * POST /api/subscriptions/change
 *
 * Upgrade or downgrade a user's active subscription.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { subscriptionChangeSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import {
  calcEndDate,
  buildPlanSnapshot,
  tierToLegacyType,
} from "@/lib/subscription/helpers";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import Invoice from "@/models/Invoice";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { Employer } from "@/models/Employer";
import { requireSubscriptionTargetAccess } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, subscriptionChangeSchema);

  // Agents/super-agents may only act on employers within their scope
  const scopeCheck = await requireSubscriptionTargetAccess(ctx, body.userId);
  if (scopeCheck) return scopeCheck;

  // 1. Find user's active subscription
  const subscription = await Subscription.findOne({
    userId: body.userId,
    status: "active",
  });

  if (!subscription) {
    return NextResponse.json(
      { error: "No active subscription found for this user" },
      { status: 404 },
    );
  }

  // 2. Look up the new plan
  const newPlan = await SubscriptionPlan.findById(body.newPlanId).lean();
  if (!newPlan || !newPlan.isActive) {
    return NextResponse.json(
      { error: "Target plan not found or inactive" },
      { status: 404 },
    );
  }

  // 3. Ensure same targetRole
  if (newPlan.targetRole !== subscription.targetRole) {
    return NextResponse.json(
      { error: "Cannot change to a plan with a different target role" },
      { status: 400 },
    );
  }

  // 4. Same plan guard
  if (subscription.planId.toString() === newPlan._id.toString()) {
    return NextResponse.json(
      { error: "User is already on this plan" },
      { status: 400 },
    );
  }

  // 5. Determine upgrade vs downgrade
  const oldTier = subscription.planSnapshot?.tier ?? 0;
  const action = newPlan.tier > oldTier ? "upgraded" : "downgraded";
  const oldPlanName = subscription.planSnapshot?.name ?? "Unknown";

  // 6. Update subscription
  const now = new Date();
  const newEndDate = calcEndDate(now, newPlan.billingCycle);

  subscription.planId = newPlan._id;
  subscription.planSnapshot = buildPlanSnapshot(newPlan);
  subscription.endDate = newEndDate;
  await subscription.save();

  // 7. Log history
  await SubscriptionHistory.create({
    userId: body.userId,
    subscriptionId: subscription._id,
    action,
    fromPlanId: subscription.planId,
    toPlanId: newPlan._id,
    fromPlanName: oldPlanName,
    toPlanName: newPlan.name,
    performedBy: ctx.userId,
    performedByRole: ctx.role,
    reason: body.reason,
    meta: { oldTier, newTier: newPlan.tier },
  });

  // 8. Create invoice
  const invoiceNumber = await generateInvoiceNumber();
  await Invoice.create({
    invoiceNumber,
    userId: body.userId,
    subscriptionId: subscription._id,
    planId: newPlan._id,
    type: action === "upgraded" ? "upgrade" : "downgrade",
    planName: newPlan.name,
    description: `${action === "upgraded" ? "Upgrade" : "Downgrade"}: ${oldPlanName} → ${newPlan.name}`,
    amount: newPlan.price,
    currency: newPlan.currency,
    billingCycle: newPlan.billingCycle,
    periodStart: now,
    periodEnd: newEndDate,
    status: "issued",
    issuedAt: now,
  });

  // 9. Backward compat
  if (newPlan.targetRole === "employer") {
    await Employer.findOneAndUpdate(
      { userId: body.userId },
      { subscriptionType: tierToLegacyType(newPlan.tier) },
    );
  }

  // 10. Audit
  await logActivity({
    ...actorFromCtx(ctx),
    action: `subscription.${action}`,
    resource: "subscriptions",
    resourceId: subscription._id.toString(),
    meta: {
      userId: body.userId,
      fromPlan: oldPlanName,
      toPlan: newPlan.name,
      direction: action,
    },
    req,
  });

  return NextResponse.json({ subscription, action });
}

export const POST = withAuth(handler, {
  resource: "subscriptions",
  action: "update",
});
