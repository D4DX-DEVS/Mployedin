/**
 * GET /api/subscriptions/my
 *
 * Returns the current user's active subscription + usage.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import type { UserRole } from "@/types/user";

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

  const subscription = await Subscription.findOne({
    userId: ctx.userId,
    targetRole,
    status: "active",
  }).lean();

  return NextResponse.json({ subscription: subscription ?? null });
}

export const GET = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
