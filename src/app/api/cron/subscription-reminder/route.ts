/**
 * GET /api/cron/subscription-reminder — Daily cron
 *
 * Sends renewal reminder notifications to users whose subscriptions
 * expire in 7, 3, or 1 day(s). Only targets non-auto-renew subscriptions
 * (auto-renew users get a different notification on actual renewal).
 *
 * Idempotent — uses date-range windows so running multiple times per day
 * doesn't produce duplicate notifications (same-day dedup handled by the
 * notification orchestrator).
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { notify } from "@/lib/notifications/trigger";
import { logActivity } from "@/lib/audit/log";
import { forEachBounded } from "@/lib/cron/scale";
import Subscription from "@/models/Subscription";
import logger from "@/lib/logger";

export const maxDuration = 300;

const REMINDER_DAYS = [7, 3, 1] as const;

function dayRange(daysFromNow: number): { $gte: Date; $lt: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() + daysFromNow);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { $gte: start, $lt: end };
}

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  let sentCount = 0;
  const errors: string[] = [];

  for (const days of REMINDER_DAYS) {
    const range = dayRange(days);

    // Only remind non-auto-renew users (auto-renew users are handled silently)
    // Capped at 1000 per day window; same-day dedup via notification orchestrator.
    const subs = await Subscription.find({
      status: "active",
      autoRenew: false,
      endDate: range,
    }).limit(1000).lean();

    const notifyTask = async (sub: typeof subs[0]) => {
      const rolePath = sub.targetRole === "employer" ? "employer" : "job-seeker";
      const urgency = days === 1 ? "tomorrow" : `in ${days} days`;

      await notify({
        userId: sub.userId.toString(),
        type: "system",
        title: `Subscription expiring ${urgency}`,
        message: `Your ${sub.planSnapshot?.name ?? "subscription"} plan expires ${urgency}. Contact your administrator to renew and avoid losing access to premium features.`,
        link: `/en/${rolePath}/subscription`,
        sendEmail: days <= 3, // email only for 3-day and 1-day reminders
      });

      sentCount++;
    };

    const result = await forEachBounded(subs, 10, notifyTask, `subscription-reminder-${days}d`);
    if (result.failed > 0) errors.push(`${days}d reminders: ${result.failed} failed (see logs)`);
  }

  // Also remind auto-renew users at 3 days (informational)
  const autoRenewRange = dayRange(3);
  const autoRenewSubs = await Subscription.find({
    status: "active",
    autoRenew: true,
    endDate: autoRenewRange,
  }).limit(1000).lean();

  const notifyAutoRenewTask = async (sub: typeof autoRenewSubs[0]) => {
    const rolePath = sub.targetRole === "employer" ? "employer" : "job-seeker";
    await notify({
      userId: sub.userId.toString(),
      type: "system",
      title: "Subscription auto-renewal in 3 days",
      message: `Your ${sub.planSnapshot?.name ?? "subscription"} plan will auto-renew in 3 days. No action is needed.`,
      link: `/en/${rolePath}/subscription`,
    });
    sentCount++;
  };

  const autoRenewResult = await forEachBounded(autoRenewSubs, 10, notifyAutoRenewTask, "subscription-reminder-autorenew");
  if (autoRenewResult.failed > 0) errors.push(`auto-renew reminders: ${autoRenewResult.failed} failed (see logs)`);

  await logActivity({
    action: "subscription.cron_reminder",
    resource: "subscriptions",
    actorRole: "system",
    meta: { sentCount, errors: errors.length },
    req,
  });

  return NextResponse.json({
    success: true,
    sent: sentCount,
    errors: errors.length ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
