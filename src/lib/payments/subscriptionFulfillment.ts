/**
 * Subscription side-effects of online payments.
 *
 * - applyPaidInvoiceToSubscription: the ONLY place a checkout / gateway-renewal
 *   invoice changes a subscription, and only once the invoice is fully paid
 *   (fixes "plan applied before payment"). Idempotent: the invoice's
 *   `activationPending` flag is claimed atomically.
 * - markSubscriptionPastDue: renewal unpaid / renewal payment failed.
 * - suspendLapsedPastDueSubscriptions: past_due beyond the grace window.
 */

import { logActivity } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import logger from "@/lib/logger";
import {
  calcEndDate,
  nextUsageReset,
  initAiUsage,
  buildPlanSnapshot,
  tierToLegacyType,
} from "@/lib/subscription/helpers";
import { getPastDueGraceDays } from "@/lib/subscription/gracePeriod";
import Invoice from "@/models/Invoice";
import Subscription from "@/models/Subscription";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { Employer } from "@/models/Employer";

export interface FulfilmentInvoice {
  _id: unknown;
  invoiceNumber?: string;
  category?: string;
  type?: string;
  status?: string;
  userId: unknown;
  planId?: unknown;
  subscriptionId?: unknown;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  activationPending?: boolean;
}

export interface FulfilmentResult {
  status: "applied" | "skipped" | "already_applied" | "error";
  subscriptionId?: string;
  action?: string;
  error?: string;
}

function subscriptionLink(targetRole: string): string {
  return targetRole === "employer" ? "/employer/subscription" : "/job-seeker/subscription";
}

function freshUsage() {
  return {
    activeJobs: 0,
    applicationsViewed: 0,
    applicationsSubmitted: 0,
    aiUsage: initAiUsage(),
  };
}

/**
 * Apply a PAID subscription invoice (new plan, plan change or renewal) to the
 * payer's subscription. No-op for invoices that don't carry activationPending
 * (manual-mode invoices whose plan change was applied when they were issued).
 */
export async function applyPaidInvoiceToSubscription(
  invoice: FulfilmentInvoice,
  ctx: { provider: string; paymentId?: string } = { provider: "manual" },
): Promise<FulfilmentResult> {
  if (invoice.status !== "paid" || !invoice.activationPending || !invoice.planId) {
    return { status: "skipped" };
  }

  const now = new Date();
  // Atomic claim — a webhook and the return-page confirmation racing each
  // other can both reach here; exactly one flips the flag.
  const claimed = await Invoice.findOneAndUpdate(
    { _id: invoice._id, activationPending: true },
    { $set: { activationPending: false, fulfilledAt: now } },
    { returnDocument: "after" },
  );
  if (!claimed) return { status: "already_applied" };

  try {
    return await applyClaimedInvoice(invoice, ctx, now);
  } catch (err) {
    // Release the claim so a retry (gateway redelivery / admin) can apply it.
    await Invoice.updateOne(
      { _id: invoice._id },
      { $set: { activationPending: true }, $unset: { fulfilledAt: 1 } },
    ).catch((releaseErr: unknown) =>
      logger.error({ err: releaseErr, invoiceId: String(invoice._id) }, "Failed to release subscription fulfilment claim"),
    );
    throw err;
  }
}

async function applyClaimedInvoice(
  invoice: FulfilmentInvoice,
  ctx: { provider: string; paymentId?: string },
  now: Date,
): Promise<FulfilmentResult> {
  const plan = await SubscriptionPlan.findById(invoice.planId).lean();
  if (!plan) throw new Error(`Plan ${String(invoice.planId)} not found for invoice ${String(invoice._id)}`);

  const userId = String(invoice.userId);
  const existing = invoice.subscriptionId
    ? await Subscription.findById(invoice.subscriptionId)
    : await Subscription.findOne({
        userId,
        targetRole: plan.targetRole,
        status: { $in: ["active", "past_due", "suspended"] },
      });

  let subscription;
  let action: "assigned" | "upgraded" | "downgraded" | "renewed" | "reactivated";
  const fromPlanId = existing?.planId;
  const fromPlanName = existing?.planSnapshot?.name as string | undefined;

  if (invoice.type === "renewal") {
    if (!existing) throw new Error(`Renewal invoice ${String(invoice._id)} has no subscription`);
    const cycle = plan.billingCycle ?? existing.planSnapshot?.billingCycle ?? "monthly";
    // Paid within the invoiced period → honour it; paid after it ended → a
    // fresh period from today so the customer gets what they paid for.
    const periodEnd = invoice.periodEnd ? new Date(invoice.periodEnd) : null;
    const start = periodEnd && periodEnd.getTime() > now.getTime() && invoice.periodStart
      ? new Date(invoice.periodStart)
      : now;
    const end = periodEnd && periodEnd.getTime() > now.getTime() ? periodEnd : calcEndDate(now, cycle);

    action = existing.status === "suspended" ? "reactivated" : "renewed";
    if (String(existing.planId) !== String(plan._id)) {
      existing.planId = plan._id;
      existing.planSnapshot = buildPlanSnapshot(plan);
    }
    existing.status = "active";
    existing.startDate = start;
    existing.endDate = end;
    existing.usage = freshUsage();
    existing.usageResetAt = nextUsageReset(start);
    existing.pastDueSince = undefined;
    existing.suspendedAt = undefined;
    await existing.save();
    subscription = existing;
  } else if (existing) {
    const oldTier = existing.planSnapshot?.tier ?? 0;
    action = plan.tier >= oldTier ? "upgraded" : "downgraded";
    existing.planId = plan._id;
    existing.planSnapshot = buildPlanSnapshot(plan);
    existing.status = "active";
    existing.startDate = now;
    existing.endDate = calcEndDate(now, plan.billingCycle);
    existing.usage = freshUsage();
    existing.usageResetAt = nextUsageReset(now);
    existing.pastDueSince = undefined;
    existing.suspendedAt = undefined;
    existing.pendingPlanChange = undefined;
    await existing.save();
    subscription = existing;

    // A fresh paid period supersedes any unpaid renewal still open for this
    // subscription — otherwise the overdue cron would push it back to past_due.
    await Invoice.updateMany(
      {
        subscriptionId: existing._id,
        type: "renewal",
        activationPending: true,
        paidAmount: { $lte: 0 },
        status: { $in: ["issued", "sent", "overdue"] },
        _id: { $ne: invoice._id },
      },
      {
        $set: {
          status: "cancelled",
          activationPending: false,
          internalNotes: `Superseded by paid invoice ${invoice.invoiceNumber ?? String(invoice._id)}`,
        },
      },
    );
  } else {
    action = "assigned";
    subscription = await Subscription.create({
      userId,
      targetRole: plan.targetRole,
      planId: plan._id,
      planSnapshot: buildPlanSnapshot(plan),
      status: "active",
      startDate: now,
      endDate: calcEndDate(now, plan.billingCycle),
      autoRenew: true,
      usage: freshUsage(),
      usageResetAt: nextUsageReset(now),
      assignedBy: userId,
      assignedByRole: "system",
      notes: `Purchased online via ${ctx.provider}`,
    });
  }

  const subscriptionId = String(subscription._id);
  if (!invoice.subscriptionId) {
    await Invoice.updateOne({ _id: invoice._id }, { $set: { subscriptionId: subscription._id } });
  }

  await SubscriptionHistory.create({
    userId,
    subscriptionId: subscription._id,
    action,
    fromPlanId,
    fromPlanName,
    toPlanId: plan._id,
    toPlanName: plan.name,
    performedByRole: "system",
    reason: `Invoice ${invoice.invoiceNumber ?? String(invoice._id)} paid (${ctx.provider}${ctx.paymentId ? ` ${ctx.paymentId}` : ""})`,
  });

  if (plan.targetRole === "employer") {
    await Employer.findOneAndUpdate(
      { userId },
      { paymentStatus: "active", subscriptionType: tierToLegacyType(plan.tier) },
    );
  }

  await logActivity({
    actorRole: "system",
    action: `subscription.payment_${action}`,
    resource: "subscriptions",
    resourceId: subscriptionId,
    meta: {
      userId,
      invoiceId: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
      planName: plan.name,
      provider: ctx.provider,
      paymentId: ctx.paymentId,
    },
  });

  await notify({
    userId,
    type: "system",
    title: "Subscription active",
    message: `Your ${plan.name} plan is now active until ${subscription.endDate.toISOString().slice(0, 10)}.`,
    link: subscriptionLink(plan.targetRole),
    sendEmail: true,
  }).catch((err: unknown) => logger.warn({ err, subscriptionId }, "Subscription activation notification failed"));

  return { status: "applied", subscriptionId, action };
}

/**
 * Mark a subscription past_due (renewal unpaid or renewal payment failed).
 * Only an `active` subscription moves; the grace clock starts at `since`.
 */
export async function markSubscriptionPastDue(
  subscriptionId: unknown,
  opts: { since?: Date; reason: string; invoiceNumber?: string },
): Promise<boolean> {
  const since = opts.since ?? new Date();
  const updated = await Subscription.findOneAndUpdate(
    { _id: subscriptionId, status: "active" },
    { $set: { status: "past_due", pastDueSince: since } },
    { returnDocument: "after" },
  );
  if (!updated) return false;

  await logActivity({
    actorRole: "system",
    action: "subscription.past_due",
    resource: "subscriptions",
    resourceId: String(updated._id),
    meta: { reason: opts.reason, invoiceNumber: opts.invoiceNumber, graceDays: getPastDueGraceDays() },
  });

  await notify({
    userId: String(updated.userId),
    type: "system",
    title: "Subscription payment due",
    message: `Your ${updated.planSnapshot?.name ?? ""} plan renewal${opts.invoiceNumber ? ` (invoice ${opts.invoiceNumber})` : ""} is unpaid. Pay within ${getPastDueGraceDays()} days to keep access.`,
    link: subscriptionLink(updated.targetRole),
    sendEmail: true,
  }).catch((err: unknown) => logger.warn({ err }, "Past-due notification failed"));

  return true;
}

/** Suspend past_due subscriptions whose grace window has run out. */
export async function suspendLapsedPastDueSubscriptions(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - getPastDueGraceDays() * 24 * 60 * 60 * 1000);
  const lapsed = await Subscription.find({ status: "past_due", pastDueSince: { $lte: cutoff } })
    .select("_id userId targetRole planId planSnapshot")
    .limit(500)
    .lean();

  let suspended = 0;
  for (const sub of lapsed) {
    const res = await Subscription.updateOne(
      { _id: sub._id, status: "past_due" },
      { $set: { status: "suspended", suspendedAt: now } },
    );
    if (!res.modifiedCount) continue;
    suspended++;

    await SubscriptionHistory.create({
      userId: sub.userId,
      subscriptionId: sub._id,
      action: "suspended",
      fromPlanId: sub.planId,
      fromPlanName: sub.planSnapshot?.name,
      performedByRole: "system",
      reason: "Renewal invoice unpaid after the payment grace period",
    });

    if (sub.targetRole === "employer") {
      await Employer.findOneAndUpdate(
        { userId: sub.userId },
        { paymentStatus: "overdue", subscriptionType: "basic" },
      );
    }

    await notify({
      userId: String(sub.userId),
      type: "system",
      title: "Subscription suspended",
      message: `Your ${sub.planSnapshot?.name ?? ""} plan was suspended because the renewal invoice is unpaid. Pay it to restore access.`,
      link: subscriptionLink(sub.targetRole),
      sendEmail: true,
    }).catch((err: unknown) => logger.warn({ err }, "Suspension notification failed"));
  }
  return suspended;
}
