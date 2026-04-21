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
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import { calcEndDate, nextUsageReset, initAiUsage, tierToLegacyType } from "@/lib/subscription/helpers";
import Subscription from "@/models/Subscription";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import Invoice from "@/models/Invoice";
import { Employer } from "@/models/Employer";
import User from "@/models/User";

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();

  // Find all active subscriptions whose endDate has passed
  const expiredSubs = await Subscription.find({
    status: "active",
    endDate: { $lte: now },
  }).lean();

  if (!expiredSubs.length) {
    return NextResponse.json({ success: true, renewed: 0, expired: 0, timestamp: now.toISOString() });
  }

  let renewedCount = 0;
  let expiredCount = 0;
  const errors: string[] = [];

  for (const sub of expiredSubs) {
    try {
      if (sub.autoRenew) {
        // ── Auto-Renew ──────────────────────────────────────────
        const cycle = sub.planSnapshot?.billingCycle ?? "monthly";
        const newStart = new Date(sub.endDate);
        const newEnd = calcEndDate(newStart, cycle);

        await Subscription.findByIdAndUpdate(sub._id, {
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
        });

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

        // Backward compat
        if (sub.targetRole === "employer") {
          await Employer.findOneAndUpdate(
            { userId: sub.userId },
            { paymentStatus: "active" },
          );
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
        await Subscription.findByIdAndUpdate(sub._id, {
          $set: { status: "expired" },
        });

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

        // Backward compat
        if (sub.targetRole === "employer") {
          await Employer.findOneAndUpdate(
            { userId: sub.userId },
            { paymentStatus: "pending" },
          );
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Sub ${sub._id}: ${msg}`);
      console.error(`[cron/subscription-expiry] Error processing ${sub._id}:`, err);
    }
  }

  // Audit log the cron run
  await logActivity({
    action: "subscription.cron_expiry",
    resource: "subscriptions",
    actorRole: "system",
    meta: { renewed: renewedCount, expired: expiredCount, errors: errors.length },
    req,
  });

  return NextResponse.json({
    success: true,
    processed: expiredSubs.length,
    renewed: renewedCount,
    expired: expiredCount,
    errors: errors.length ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
