/**
 * Auto-assign the default subscription plan to a newly registered user.
 *
 * Called from employer-register and job-seeker-register routes.
 * If no default plan exists for the role, does nothing (grace period covers them).
 */

import connectDB from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { calcEndDate, nextUsageReset, initAiUsage, buildPlanSnapshot } from "./helpers";

export async function autoAssignDefaultPlan(
  userId: string,
  targetRole: "employer" | "job_seeker",
): Promise<void> {
  await connectDB();

  // Find the default plan for this role
  const plan = await SubscriptionPlan.findOne({
    targetRole,
    isDefault: true,
    isActive: true,
  }).lean();

  if (!plan) {
    // Not an error for the user (the grace period covers them), but a fresh
    // environment with no seeded catalogue used to look identical to a healthy
    // one. Surface it — /api/admin/system-health reports the same condition.
    logger.warn(
      { userId, targetRole },
      "[subscription] No active default plan for role — registration auto-assign skipped. Run scripts/seed-subscription-plans.mjs.",
    );
    return;
  }

  // Check if user already has an active subscription (shouldn't happen on signup, but guard)
  const existing = await Subscription.findOne({
    userId,
    targetRole,
    status: "active",
  }).lean();

  if (existing) return;

  const startDate = new Date();
  const endDate = calcEndDate(startDate, plan.billingCycle);

  // Create subscription
  const subscription = await Subscription.create({
    userId,
    targetRole,
    planId: plan._id,
    planSnapshot: buildPlanSnapshot(plan),
    status: "active",
    startDate,
    endDate,
    autoRenew: true, // Free plans auto-renew by default
    usage: {
      activeJobs: 0,
      applicationsViewed: 0,
      applicationsSubmitted: 0,
      aiUsage: initAiUsage(),
    },
    usageResetAt: nextUsageReset(startDate),
    assignedBy: userId, // self-assigned via system
    assignedByRole: "system",
    notes: "Auto-assigned default plan on registration",
  });

  // History entry
  await SubscriptionHistory.create({
    userId,
    subscriptionId: subscription._id,
    action: "assigned",
    toPlanId: plan._id,
    toPlanName: plan.name,
    performedBy: userId,
    performedByRole: "system",
    reason: "Auto-assigned on registration",
  });

  // Skip invoices for auto-assigned plans — no payment system yet.
  // When payments are added, re-enable invoice generation here.
}
