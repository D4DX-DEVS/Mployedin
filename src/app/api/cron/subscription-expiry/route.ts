/**
 * GET /api/cron/subscription-expiry — Daily cron
 *
 * 1. Find active subscriptions past their endDate.
 * 2. Auto-renew if autoRenew === true (create new period, invoice, reset usage).
 * 3. Expire if autoRenew === false (set status, log history, notify user).
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
import { calcEndDate, nextUsageReset, initAiUsage, tierToLegacyType } from "@/lib/subscription/helpers";
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

  const processSubTask = async (sub: typeof expiredSubs[0]) => {
    if (sub.autoRenew) {
      // ── Auto-Renew ──────────────────────────────────────────
      const cycle = sub.planSnapshot?.billingCycle ?? "monthly";
      const newStart = new Date(sub.endDate);
      const newEnd = calcEndDate(newStart, cycle);

      // Guard with current status check (idempotent)
      const updateResult = await Subscription.findByIdAndUpdate(
        sub._id,
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

      if (!updateResult) {
        throw new Error("Failed to update subscription");
      }

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
      // Guard with current status check (idempotent)
      const updateResult = await Subscription.findByIdAndUpdate(
        sub._id,
        { $set: { status: "expired" } },
        { returnDocument: "after" }
      );

      if (!updateResult) {
        throw new Error("Failed to update subscription");
      }

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
    meta: { renewed: renewedCount, expired: expiredCount, errors: errors.length },
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
      errors: errors.length ? errors : undefined,
      timestamp: now.toISOString(),
    },
    { status: errors.length > 0 ? 500 : 200 }
  );
}
