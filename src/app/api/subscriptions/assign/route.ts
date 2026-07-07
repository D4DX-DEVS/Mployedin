/**
 * POST /api/subscriptions/assign
 *
 * Admin/super-agent/agent assigns a subscription plan to a user.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { subscriptionAssignSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import {
  calcEndDate,
  nextUsageReset,
  initAiUsage,
  buildPlanSnapshot,
  tierToLegacyType,
} from "@/lib/subscription/helpers";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import Invoice from "@/models/Invoice";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { User } from "@/models/User";
import { Employer } from "@/models/Employer";
import { requireSubscriptionTargetAccess } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  // Only admin/super_agent/agent can assign
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, subscriptionAssignSchema);

  // Agents/super-agents may only act on employers within their scope
  const scopeCheck = await requireSubscriptionTargetAccess(ctx, body.userId);
  if (scopeCheck) return scopeCheck;

  // 1. Look up the plan
  const plan = await SubscriptionPlan.findById(body.planId).lean();
  if (!plan || !plan.isActive) {
    return NextResponse.json(
      { error: "Plan not found or inactive" },
      { status: 404 },
    );
  }

  // 2. Verify user exists and role matches plan targetRole
  const user = await User.findById(body.userId).lean();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.role !== plan.targetRole) {
    return NextResponse.json(
      { error: `Plan is for ${plan.targetRole} but user role is ${user.role}` },
      { status: 400 },
    );
  }

  // 3. Check for existing active subscription
  const existing = await Subscription.findOne({
    userId: body.userId,
    targetRole: plan.targetRole,
    status: "active",
  }).lean();

  if (existing) {
    return NextResponse.json(
      { error: "User already has an active subscription. Use the change endpoint to upgrade/downgrade." },
      { status: 409 },
    );
  }

  // 4. Calculate dates
  const startDate = body.startDate ? new Date(body.startDate) : new Date();
  const endDate = body.endDate
    ? new Date(body.endDate)
    : calcEndDate(startDate, plan.billingCycle);

  // 5. Create Subscription
  const subscription = await Subscription.create({
    userId: body.userId,
    targetRole: plan.targetRole,
    planId: plan._id,
    planSnapshot: buildPlanSnapshot(plan),
    status: "active",
    startDate,
    endDate,
    autoRenew: body.autoRenew ?? false,
    usage: {
      activeJobs: 0,
      applicationsViewed: 0,
      applicationsSubmitted: 0,
      aiUsage: initAiUsage(),
    },
    usageResetAt: nextUsageReset(startDate),
    assignedBy: ctx.userId,
    assignedByRole: ctx.role,
    notes: body.notes,
  });

  // 6. Create SubscriptionHistory
  await SubscriptionHistory.create({
    userId: body.userId,
    subscriptionId: subscription._id,
    action: "assigned",
    toPlanId: plan._id,
    toPlanName: plan.name,
    performedBy: ctx.userId,
    performedByRole: ctx.role,
    reason: body.notes,
  });

  // 7. Create Invoice
  const invoiceNumber = await generateInvoiceNumber();
  await Invoice.create({
    invoiceNumber,
    userId: body.userId,
    subscriptionId: subscription._id,
    planId: plan._id,
    type: "new",
    planName: plan.name,
    description: `New subscription: ${plan.name} (${plan.billingCycle})`,
    amount: plan.price,
    currency: plan.currency,
    billingCycle: plan.billingCycle,
    periodStart: startDate,
    periodEnd: endDate,
    status: "issued",
    issuedAt: new Date(),
  });

  // 8. Backward compat: update Employer fields
  if (plan.targetRole === "employer") {
    await Employer.findOneAndUpdate(
      { userId: body.userId },
      {
        paymentStatus: "active",
        subscriptionType: tierToLegacyType(plan.tier),
      },
    );
  }

  // 9. Audit log
  await logActivity({
    ...actorFromCtx(ctx),
    action: "subscription.assign",
    resource: "subscriptions",
    resourceId: subscription._id.toString(),
    meta: { userId: body.userId, planId: body.planId, planName: plan.name },
    req,
  });

  return NextResponse.json({ subscription }, { status: 201 });
}

export const POST = withAuth(handler, {
  resource: "subscriptions",
  action: "create",
});
