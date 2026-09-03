/**
 * Gateway-agnostic subscription purchase fulfillment.
 *
 * Called from the payment webhook on `payment.success`. Creates or upgrades
 * the user's subscription and writes a PAID invoice with the gateway payment
 * reference. Idempotent by paymentId — safe against webhook retries.
 */

import { logActivity } from "@/lib/audit/log";
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
import SubscriptionHistory from "@/models/SubscriptionHistory";
import Invoice from "@/models/Invoice";
import { User } from "@/models/User";
import { Employer } from "@/models/Employer";
import type { PaymentMethodType, PaymentProvider } from "@/lib/payments/types";

export interface FulfillPurchaseInput {
  userId: string;
  planId: string;
  /** Gateway payment id — idempotency key. */
  paymentId: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  method?: PaymentMethodType;
}

export interface FulfillPurchaseResult {
  status: "fulfilled" | "already_processed" | "error";
  subscriptionId?: string;
  invoiceNumber?: string;
  error?: string;
}

/** Map gateway payment method to Invoice payment enum. */
function toInvoiceMethod(method?: PaymentMethodType): "credit_card" | "online" {
  return method === "card" ? "credit_card" : "online";
}

export async function fulfillSubscriptionPurchase(
  input: FulfillPurchaseInput,
): Promise<FulfillPurchaseResult> {
  // 1. Idempotency — webhook retries must not double-fulfill
  const existing = await Invoice.findOne({
    category: "subscription",
    "payments.referenceNumber": input.paymentId,
  })
    .select("invoiceNumber subscriptionId")
    .lean();

  if (existing) {
    return {
      status: "already_processed",
      subscriptionId: existing.subscriptionId?.toString(),
      invoiceNumber: existing.invoiceNumber,
    };
  }

  // 2. Load plan + user. Payment already captured — fulfill even if the plan
  //    was deactivated between checkout and webhook.
  const plan = await SubscriptionPlan.findById(input.planId).lean();
  if (!plan) return { status: "error", error: `Plan ${input.planId} not found` };

  const user = await User.findById(input.userId).select("role").lean();
  if (!user) return { status: "error", error: `User ${input.userId} not found` };
  if (user.role !== plan.targetRole) {
    return {
      status: "error",
      error: `Plan is for ${plan.targetRole} but user role is ${user.role}`,
    };
  }

  const now = new Date();
  const endDate = calcEndDate(now, plan.billingCycle);

  // 3. Create new subscription, or switch plan on the active one
  const active = await Subscription.findOne({
    userId: input.userId,
    targetRole: plan.targetRole,
    status: "active",
  });

  let subscription;
  let historyAction: "assigned" | "upgraded" | "downgraded";
  let invoiceType: "new" | "upgrade" | "downgrade";
  let fromPlanName: string | undefined;

  if (active) {
    const oldTier = active.planSnapshot?.tier ?? 0;
    fromPlanName = active.planSnapshot?.name;
    historyAction = plan.tier >= oldTier ? "upgraded" : "downgraded";
    invoiceType = plan.tier >= oldTier ? "upgrade" : "downgrade";

    active.planId = plan._id;
    active.planSnapshot = buildPlanSnapshot(plan);
    active.startDate = now;
    active.endDate = endDate;
    active.usage = {
      activeJobs: 0,
      applicationsViewed: 0,
      applicationsSubmitted: 0,
      aiUsage: initAiUsage(),
    };
    active.usageResetAt = nextUsageReset(now);
    await active.save();
    subscription = active;
  } else {
    historyAction = "assigned";
    invoiceType = "new";
    subscription = await Subscription.create({
      userId: input.userId,
      targetRole: plan.targetRole,
      planId: plan._id,
      planSnapshot: buildPlanSnapshot(plan),
      status: "active",
      startDate: now,
      endDate,
      autoRenew: true,
      usage: {
        activeJobs: 0,
        applicationsViewed: 0,
        applicationsSubmitted: 0,
        aiUsage: initAiUsage(),
      },
      usageResetAt: nextUsageReset(now),
      // Subscription.assignedBy is `required: true` — omitting it made every
      // first-time online purchase fail schema validation. Self-assigned, the
      // same convention autoAssignDefaultPlan() uses for system grants.
      assignedBy: input.userId,
      assignedByRole: "system",
      notes: `Purchased online via ${input.provider}`,
    });
  }

  // 4. History
  await SubscriptionHistory.create({
    userId: input.userId,
    subscriptionId: subscription._id,
    action: historyAction,
    toPlanId: plan._id,
    toPlanName: plan.name,
    fromPlanName,
    performedByRole: "system",
    reason: `Online payment via ${input.provider} (${input.paymentId})`,
  });

  // 5. Paid invoice with gateway payment record
  const invoiceNumber = await generateInvoiceNumber();
  await Invoice.create({
    invoiceNumber,
    userId: input.userId,
    subscriptionId: subscription._id,
    planId: plan._id,
    type: invoiceType,
    planName: plan.name,
    description:
      invoiceType === "new"
        ? `New subscription: ${plan.name} (${plan.billingCycle})`
        : `${invoiceType === "upgrade" ? "Upgrade" : "Downgrade"}: ${fromPlanName ?? "previous plan"} → ${plan.name}`,
    subtotal: input.amount,
    totalAmount: input.amount,
    amount: input.amount,
    currency: input.currency || plan.currency,
    billingCycle: plan.billingCycle,
    periodStart: now,
    periodEnd: endDate,
    status: "paid",
    paymentTerms: "immediate",
    issuedAt: now,
    paidAt: now,
    paidAmount: input.amount,
    balanceDue: 0,
    payments: [
      {
        amount: input.amount,
        paymentDate: now,
        paymentMethod: toInvoiceMethod(input.method),
        referenceNumber: input.paymentId,
        notes: `Gateway: ${input.provider}`,
        recordedBy: input.userId,
      },
    ],
  });

  // 6. Backward compat: legacy Employer fields
  if (plan.targetRole === "employer") {
    await Employer.findOneAndUpdate(
      { userId: input.userId },
      { paymentStatus: "active", subscriptionType: tierToLegacyType(plan.tier) },
    );
  }

  // 7. Audit
  await logActivity({
    actorRole: "system",
    action: `subscription.purchase_${historyAction}`,
    resource: "subscriptions",
    resourceId: subscription._id.toString(),
    meta: {
      userId: input.userId,
      planName: plan.name,
      provider: input.provider,
      paymentId: input.paymentId,
      amount: input.amount,
      invoiceNumber,
    },
  });

  return {
    status: "fulfilled",
    subscriptionId: subscription._id.toString(),
    invoiceNumber,
  };
}
