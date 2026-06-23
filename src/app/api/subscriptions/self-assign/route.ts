/**
 * POST /api/subscriptions/self-assign
 *
 * Allows a logged-in employer or job seeker to claim their default (Free)
 * plan if they don't already have an active subscription.
 *
 * Called when the subscription page detects no active subscription — this
 * lets the user self-recover without admin intervention.
 *
 * Returns the newly created subscription or the existing one.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { autoAssignDefaultPlan } from "@/lib/subscription/autoAssign";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  const targetRole =
    ctx.role === "employer"
      ? "employer"
      : ctx.role === "job_seeker"
        ? "job_seeker"
        : null;

  if (!targetRole) {
    return NextResponse.json(
      { error: "Only employers and job seekers can self-assign plans" },
      { status: 403 },
    );
  }

  await connectDB();

  // If they already have one, return it (idempotent)
  const existing = await Subscription.findOne({
    userId: ctx.userId,
    targetRole,
    status: "active",
  }).lean();

  if (existing) {
    return NextResponse.json({ subscription: existing, created: false });
  }

  // Assign the default plan
  await autoAssignDefaultPlan(ctx.userId, targetRole);

  const subscription = await Subscription.findOne({
    userId: ctx.userId,
    targetRole,
    status: "active",
  }).lean();

  if (!subscription) {
    // No default plan exists in DB yet
    return NextResponse.json(
      { error: "No default plan configured. Please contact your administrator." },
      { status: 422 },
    );
  }

  return NextResponse.json({ subscription, created: true }, { status: 201 });
}

export const POST = withAuth(handler, {
  resource: "subscriptions",
  action: "read", // read permission is sufficient for self-service
});
