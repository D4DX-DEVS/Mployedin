/**
 * GET /api/subscriptions/my
 *
 * Returns the current user's active subscription + usage.
 */

import { NextRequest, NextResponse } from "next/server";
import { pastDueGraceEndsAt } from "@/lib/subscription/gracePeriod";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import { Employer } from "@/models/Employer";
import type { UserRole } from "@/types/user";
import { countLiveActiveJobs } from "@/lib/subscription/withSubscription";
import { countActiveTeamMembers } from "@/lib/subscription/featureGate";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  // Determine targetRole from user role
  const targetRole =
    ctx.role === "employer"
      ? "employer"
      : ctx.role === "job_seeker"
        ? "job_seeker"
        : null;

  if (!targetRole) {
    // Admin/agent roles don't have subscriptions
    return NextResponse.json({ subscription: null });
  }

  // past_due (unpaid renewal, still in its grace window) is shown too, so the
  // page can prompt for payment; suspended/expired fall through to "no plan".
  const subscription = await Subscription.findOne({
    userId: ctx.userId,
    targetRole,
    status: { $in: ["active", "past_due"] },
  }).lean();

  // EMP-14: the stored usage.activeJobs counter only ever increments and there
  // is no stored seat counter, so the meters read "0 / 2" beside 20 live jobs.
  // Report the same live counts the plan gates enforce. ctx.userId is the
  // company owner here (withAuth swaps it for team members), so this is the
  // company's subscription and company's usage.
  if (subscription && targetRole === "employer") {
    const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    const [activeJobs, teamMembers] = await Promise.all([
      employer ? countLiveActiveJobs(String(employer._id)) : 0,
      countActiveTeamMembers(ctx.userId),
    ]);
    subscription.usage = { ...subscription.usage, activeJobs, teamMembers } as typeof subscription.usage;
  }

  if (subscription?.status === "past_due" && subscription.pastDueSince) {
    (subscription as typeof subscription & { graceEndsAt?: Date }).graceEndsAt = pastDueGraceEndsAt(subscription.pastDueSince);
  }

  return NextResponse.json({ subscription: subscription ?? null });
}

export const GET = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
