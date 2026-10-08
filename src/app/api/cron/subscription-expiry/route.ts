/**
 * GET /api/cron/subscription-expiry — Daily cron
 *
 * 1. Find active subscriptions past their endDate.
 * 2. Apply a scheduled downgrade (subscription.pendingPlanChange) first, so the
 *    renewal is for the plan the customer chose.
 * 3. Auto-renew if autoRenew === true:
 *    - manual mode (no payment gateway): extend the period now + issue a
 *      renewal invoice (unchanged behaviour);
 *    - gateway mode, paid plan: do NOT extend before payment — the
 *      subscription goes past_due (plan access continues through the payment
 *      grace window) and a renewal invoice is issued; paying it (webhook /
 *      return page) extends the period. Unpaid past the grace → the
 *      invoice-overdue cron suspends it.
 * 4. Expire if autoRenew === false (set status, log history, notify user).
 *
 * Idempotent — safe to run multiple times; already-processed subs are skipped.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { notify } from "@/lib/notifications/trigger";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import { calcEndDate, nextUsageReset, initAiUsage, tierToLegacyType, buildPlanSnapshot } from "@/lib/subscription/helpers";
import { isPaymentGatewayEnabled } from "@/lib/payments";
import { getPastDueGraceDays } from "@/lib/subscription/gracePeriod";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import { forEachBounded } from "@/lib/cron/scale";
import Subscription from "@/models/Subscription";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import Invoice from "@/models/Invoice";
import { Employer } from "@/models/Employer";
import User from "@/models/User";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();

  // Find all active subscriptions whose endDate has passed. Limited to 500 per run.
  // Docs stop matching once status flips, so next run drains the rest — idempotent.
  const expiredSubs = await Subscription.find({
    status: "active",
    endDate: { $lte: now },
  }).limit(500).lean();

  if (!expiredSubs.length) {
    return NextResponse.json({ success: true, renewed: 0, expired: 0, timestamp: now.toISOString() });
  }

  let renewedCount = 0;
  let expiredCount = 0;
  const errors: string[] = [];

  // Batch fetch employers once; lookups below are by the sub's userId,
  // so key the map by Employer.userId (NOT _id).
  const employerUserIds = expiredSubs
    .filter((sub) => sub.targetRole === "employer")
    .map((sub) => sub.userId);
  const employerDocs = employerUserIds.length > 0
    ? await Employer.find({ userId: { $in: employerUserIds } }).select("_id userId").lean()
    : [];
  const employersMap = new Map(employerDocs.map((e) => [String(e.userId), e]));

  const gatewayMode = isPaymentGatewayEnabled();
  let downgradedCount = 0;
  let pastDueCount = 0;

  /**
   * Apply a downgrade scheduled for the period end. Returns the (possibly
   * updated) subscription snapshot to renew with.
   */
  const applyPendingPlanChange = async (sub: typeof expiredSubs[0]) => {
    const pending = sub.pendingPlanChange;
    if (!pending?.planId) return sub;
    const plan = await SubscriptionPlan.findById(pending.planId).lean();
    if (!plan || plan.targetRole !== sub.targetRole) {
      await Subscription.updateOne({ _id: sub._id }, { $unset: { pendingPlanChange: 1 } });
      return sub;
    }
    const snapshot = buildPlanSnapshot(plan);
    // Guard on pendingPlanChange so overlapping runs apply it once.
    const res = await Subscription.updateOne(
      { _id: sub._id, status: "active", "pendingPlanChange.planId": pending.planId },
      { $set: { planId: plan._id, planSnapshot: snapshot }, $unset: { pendingPlanChange: 1 } },
    );
    if (!res.modifiedCount) return sub;
    await SubscriptionHistory.create({
      userId: sub.userId,
      subscriptionId: sub._id,
      action: "downgraded",
      fromPlanId: sub.planId,
      fromPlanName: sub.planSnapshot?.name,
      toPlanId: plan._id,
      toPlanName: plan.name,
      performedBy: pending.requestedBy ?? null,
      performedByRole: "system",
      reason: "Scheduled downgrade applied at period end",
    });
    if (sub.targetRole === "employer") {
      await Employer.findOneAndUpdate({ userId: sub.userId }, { subscriptionType: tierToLegacyType(plan.tier) });
    }
    downgradedCount++;
    return { ...sub, planId: plan._id, planSnapshot: snapshot, pendingPlanChange: undefined } as typeof sub;
  };

  const processSubTask = async (rawSub: typeof expiredSubs[0]) => {
    const sub = await applyPendingPlanChange(rawSub);

    if (sub.autoRenew && gatewayMode && (sub.planSnapshot?.price ?? 0) > 0) {
      // ── Gateway renewal: invoice first, extend on payment ──────
      const cycle = sub.planSnapshot?.billingCycle ?? "monthly";
      const periodStart = new Date(sub.endDate);
      const periodEnd = calcEndDate(periodStart, cycle);
      const graceDays = getPastDueGraceDays();

      const claimed = await Subscription.findOneAndUpdate(
        { _id: sub._id, status: "active", endDate: { $lte: now } },
        { $set: { status: "past_due", pastDueSince: now } },
        { returnDocument: "after" },
      );
      if (!claimed) return; // already processed by a concurrent run

      const employer = sub.targetRole === "employer" ? employersMap.get(String(sub.userId)) : undefined;
      const invoiceNumber = await generateInvoiceNumber();
      await Invoice.create({
        invoiceNumber,
        category: "subscription",
        userId: sub.userId,
        employerId: employer?._id,
        subscriptionId: sub._id,
        planId: sub.planId,
        type: "renewal",
        planName: sub.planSnapshot?.name ?? "Unknown",
        description: `Renewal: ${sub.planSnapshot?.name} (${cycle})`,
        subtotal: sub.planSnapshot?.price ?? 0,
        amount: sub.planSnapshot?.price ?? 0,
        currency: sub.planSnapshot?.currency ?? "AED",
        billingCycle: cycle,
        periodStart,
        periodEnd,
        status: "issued",
        issuedAt: now,
        // Due by the end of the grace window; paying extends the period.
        paymentTerms: "custom",
        customPaymentDays: graceDays,
        activationPending: true,
      });

      await logActivity({
        action: "subscription.past_due",
        resource: "subscriptions",
        resourceId: String(sub._id),
        actorRole: "system",
        meta: { reason: "Renewal invoice issued, awaiting payment", invoiceNumber, graceDays },
      });

      await notify({
        userId: sub.userId.toString(),
        type: "system",
        title: "Subscription renewal due",
        message: `Your ${sub.planSnapshot?.name} subscription period has ended. Pay renewal invoice ${invoiceNumber} within ${graceDays} days to keep your plan.`,
        link: `/${sub.targetRole === "employer" ? "en/employer" : "en/job-seeker"}/subscription`,
        sendEmail: true,
      });

      pastDueCount++;
      return;
    }

    if (sub.autoRenew) {
      // ── Auto-Renew ──────────────────────────────────────────
      const cycle = sub.planSnapshot?.billingCycle ?? "monthly";
      const newStart = new Date(sub.endDate);
      const newEnd = calcEndDate(newStart, cycle);

      // Re-assert the selection criteria inside the write so a concurrent or
      // overlapping cron run can only claim each subscription once. Without it
      // two runs both matched the same doc and each wrote a renewal invoice and
      // history row. No match => another run already renewed it; skip quietly.
      const updateResult = await Subscription.findOneAndUpdate(
        { _id: sub._id, status: "active", endDate: { $lte: now } },
        {
          $set: {
            startDate: newStart,
            endDate: newEnd,
            status: "active",
            usageResetAt: nextUsageReset(newStart),
            "usage.activeJobs": 0,
            "usage.applicationsViewed": 0,
            "usage.applicationsSubmitted": 0,
            "usage.aiUsage": initAiUsage(),
          },
        },
        { returnDocument: "after" }
      );

      if (!updateResult) return; // already processed by a concurrent run

      // History
      await SubscriptionHistory.create({
        userId: sub.userId,
        subscriptionId: sub._id,
        action: "renewed",
        toPlanId: sub.planId,
        toPlanName: sub.planSnapshot?.name,
        performedBy: null,
        performedByRole: "system",
        reason: "Auto-renewal",
      });

      // Invoice
      const invoiceNumber = await generateInvoiceNumber();
      await Invoice.create({
        invoiceNumber,
        userId: sub.userId,
        subscriptionId: sub._id,
        planId: sub.planId,
        type: "renewal",
        planName: sub.planSnapshot?.name ?? "Unknown",
        description: `Auto-renewal: ${sub.planSnapshot?.name} (${cycle})`,
        // Totals are derived from subtotal by Invoice.pre("save").
        subtotal: sub.planSnapshot?.price ?? 0,
        amount: sub.planSnapshot?.price ?? 0,
        currency: sub.planSnapshot?.currency ?? "AED",
        billingCycle: cycle,
        periodStart: newStart,
        periodEnd: newEnd,
        status: "issued",
        issuedAt: now,
      });

      // Backward compat — use cached employer map
      if (sub.targetRole === "employer") {
        const employer = employersMap.get(String(sub.userId));
        if (employer) {
          await Employer.findByIdAndUpdate(employer._id, {
            paymentStatus: "active",
          });
        }
      }

      // Notify user
      await notify({
        userId: sub.userId.toString(),
        type: "system",
        title: "Subscription renewed",
        message: `Your ${sub.planSnapshot?.name} subscription has been auto-renewed until ${newEnd.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}.`,
        link: `/${sub.targetRole === "employer" ? "en/employer" : "en/job-seeker"}/subscription`,
        sendEmail: true,
      });

      renewedCount++;
    } else {
      // ── Expire ──────────────────────────────────────────────
      // Status guard makes the flip atomic — a concurrent run that already
      // expired this subscription matches nothing and skips the history row.
      const updateResult = await Subscription.findOneAndUpdate(
        { _id: sub._id, status: "active", endDate: { $lte: now } },
        { $set: { status: "expired" } },
        { returnDocument: "after" }
      );

      if (!updateResult) return; // already processed by a concurrent run

      // History
      await SubscriptionHistory.create({
        userId: sub.userId,
        subscriptionId: sub._id,
        action: "expired",
        fromPlanId: sub.planId,
        fromPlanName: sub.planSnapshot?.name,
        performedBy: null,
        performedByRole: "system",
        reason: "Subscription period ended",
      });

      // Backward compat — reset legacy plan flags so premium feature gates
      // (e.g. SMTP override) and UI badges don't show a stale "premium" plan.
      if (sub.targetRole === "employer") {
        const employer = employersMap.get(String(sub.userId));
        if (employer) {
          await Employer.findByIdAndUpdate(employer._id, {
            paymentStatus: "pending",
            subscriptionType: "basic",
          });
        }
      }

      // Notify user
      await notify({
        userId: sub.userId.toString(),
        type: "system",
        title: "Subscription expired",
        message: `Your ${sub.planSnapshot?.name} subscription has expired. Contact your administrator to renew and regain access to premium features.`,
        link: `/${sub.targetRole === "employer" ? "en/employer" : "en/job-seeker"}/subscription`,
        sendEmail: true,
      });

      expiredCount++;
    }
  };

  // Process with bounded concurrency (10 at a time)
  const result = await forEachBounded(expiredSubs, 10, processSubTask, "subscription-expiry");
  if (result.failed > 0) errors.push(`${result.failed} subscriptions failed processing (see logs)`);

  // Audit log the cron run
  await logActivity({
    action: "subscription.cron_expiry",
    resource: "subscriptions",
    actorRole: "system",
    meta: { renewed: renewedCount, expired: expiredCount, pastDue: pastDueCount, downgraded: downgradedCount, gatewayMode, errors: errors.length },
    req,
  });

  if (errors.length > 0) {
    logger.error(
      {
        errors,
        errorIds: expiredSubs
          .filter((_, i) => errors.some((e) => e.includes(String(expiredSubs[i]._id))))
          .map((s) => String(s._id)),
      },
      `[cron/subscription-expiry] ${errors.length} errors during processing`,
    );
  }

  return NextResponse.json(
    {
      success: errors.length === 0,
      processed: expiredSubs.length,
      renewed: renewedCount,
      expired: expiredCount,
      pastDue: pastDueCount,
      downgraded: downgradedCount,
      errors: errors.length ? errors : undefined,
      timestamp: now.toISOString(),
    },
    { status: errors.length > 0 ? 500 : 200 }
  );
}
