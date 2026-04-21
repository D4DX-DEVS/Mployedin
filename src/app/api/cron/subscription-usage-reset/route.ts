/**
 * GET /api/cron/subscription-usage-reset — Monthly cron (1st of month)
 *
 * Resets usage counters for all active subscriptions whose usageResetAt
 * has passed. Sets next reset date to 1st of following month.
 *
 * Idempotent — only processes subs whose usageResetAt <= now.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { logActivity } from "@/lib/audit/log";
import { nextUsageReset, initAiUsage } from "@/lib/subscription/helpers";
import Subscription from "@/models/Subscription";

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();

  // Find active subs due for usage reset
  const result = await Subscription.updateMany(
    {
      status: "active",
      usageResetAt: { $lte: now },
    },
    [
      {
        $set: {
          "usage.activeJobs": 0,
          "usage.applicationsViewed": 0,
          "usage.applicationsSubmitted": 0,
          "usage.aiUsage": initAiUsage(),
          usageResetAt: nextUsageReset(now),
        },
      },
    ],
  );

  const resetCount = result.modifiedCount ?? 0;

  await logActivity({
    action: "subscription.cron_usage_reset",
    resource: "subscriptions",
    actorRole: "system",
    meta: { resetCount },
    req,
  });

  return NextResponse.json({
    success: true,
    reset: resetCount,
    nextReset: nextUsageReset(now).toISOString(),
    timestamp: now.toISOString(),
  });
}
