/**
 * Put a user on a plan: change their live subscription, or start one when they
 * have none. Used by the upgrade-request approval, so approving a request does
 * exactly what the admin "Change plan" / "Assign plan" actions do — history row,
 * invoice, legacy Employer fields, audit — in one call.
 *
 * A free plan issues no invoice. The admin routes used to write 0.00 invoices
 * on every free assignment, and the overdue job then showed free customers
 * "overdue" bills.
 */
import type mongoose from "mongoose";
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
import { Employer } from "@/models/Employer";

export type ApplyPlanAction = "assigned" | "upgraded" | "downgraded";

export interface ApplyPlanInput {
  userId: string;
  planId: string;
  actorId: string;
  actorRole: string;
  reason?: string;
}

export interface ApplyPlanResult {
  subscriptionId: string;
  action: ApplyPlanAction;
  invoiceId?: string;
}

export class ApplyPlanError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function applyPlanToUser(input: ApplyPlanInput): Promise<ApplyPlanResult> {
  await connectDB();
  const plan = await SubscriptionPlan.findById(input.planId).lean();
  if (!plan || !plan.isActive) throw new ApplyPlanError("That plan is no longer available.", 404);

  const now = new Date();
  const endDate = calcEndDate(now, plan.billingCycle);
  const existing = await Subscription.findOne({ userId: input.userId, targetRole: plan.targetRole, status: "active" });

  let action: ApplyPlanAction;
  let subscriptionId: mongoose.Types.ObjectId;
  let fromPlanName: string | undefined;

  if (existing) {
    if (String(existing.planId) === String(plan._id)) {
      throw new ApplyPlanError("The customer is already on this plan.", 409);
    }
    const oldTier = existing.planSnapshot?.tier ?? 0;
    const fromPlanId = existing.planId;
    fromPlanName = existing.planSnapshot?.name;
    action = plan.tier > oldTier ? "upgraded" : "downgraded";
    existing.planId = plan._id;
    existing.planSnapshot = buildPlanSnapshot(plan);
    existing.endDate = endDate;
    await existing.save();
    subscriptionId = existing._id;
    await SubscriptionHistory.create({
      userId: input.userId, subscriptionId, action, fromPlanId, toPlanId: plan._id,
      fromPlanName, toPlanName: plan.name, performedBy: input.actorId,
      performedByRole: input.actorRole, reason: input.reason, meta: { oldTier, newTier: plan.tier },
    });
  } else {
    action = "assigned";
    const created = await Subscription.create({
      userId: input.userId, targetRole: plan.targetRole, planId: plan._id,
      planSnapshot: buildPlanSnapshot(plan), status: "active", startDate: now, endDate,
      autoRenew: false,
      usage: { activeJobs: 0, applicationsViewed: 0, applicationsSubmitted: 0, aiUsage: initAiUsage() },
      usageResetAt: nextUsageReset(now), assignedBy: input.actorId, assignedByRole: input.actorRole,
      notes: input.reason,
    });
    subscriptionId = created._id;
    await SubscriptionHistory.create({
      userId: input.userId, subscriptionId, action, toPlanId: plan._id, toPlanName: plan.name,
      performedBy: input.actorId, performedByRole: input.actorRole, reason: input.reason,
    });
  }

  let invoiceId: string | undefined;
  if (plan.price > 0) {
    const invoice = await Invoice.create({
      invoiceNumber: await generateInvoiceNumber(),
      userId: input.userId, subscriptionId, planId: plan._id,
      type: action === "assigned" ? "new" : action === "upgraded" ? "upgrade" : "downgrade",
      planName: plan.name,
      description: fromPlanName ? `${fromPlanName} → ${plan.name}` : `New subscription: ${plan.name} (${plan.billingCycle})`,
      subtotal: plan.price, amount: plan.price, currency: plan.currency, billingCycle: plan.billingCycle,
      periodStart: now, periodEnd: endDate, status: "issued", issuedAt: now,
    });
    invoiceId = String(invoice._id);
  }

  if (plan.targetRole === "employer") {
    await Employer.findOneAndUpdate(
      { userId: input.userId },
      { paymentStatus: "active", subscriptionType: tierToLegacyType(plan.tier) },
    );
  }

  return { subscriptionId: String(subscriptionId), action, invoiceId };
}
