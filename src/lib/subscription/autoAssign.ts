/**
 * Auto-assign the default subscription plan to a newly registered user.
 *
 * Called from employer-register and job-seeker-register routes.
 * If no default plan exists for the role, does nothing (grace period covers them).
 */

import connectDB from "@/lib/db/mongoose";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import Invoice from "@/models/Invoice";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { generateInvoiceNumber } from "./invoiceNumber";
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

  if (!plan) return; // No default plan configured — grace period covers the user

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

  // Invoice (Free plans → $0)
  if (plan.price > 0) {
    const invoiceNumber = await generateInvoiceNumber();
    await Invoice.create({
      invoiceNumber,
      userId,
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
  }
}
