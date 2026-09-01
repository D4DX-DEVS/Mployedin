/**
 * GET /api/subscriptions/history?userId=xxx
 *
 * Returns subscription history. Admins can query any user; others see own only.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { requireSubscriptionTargetAccess } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("userId");

  // Anyone may read their own history. Reading someone else's requires that the
  // caller actually manages that subscriber — being *an* agent is not enough.
  const userId = requested && requested !== ctx.userId ? requested : ctx.userId;
  if (userId !== ctx.userId) {
    const denied = await requireSubscriptionTargetAccess(ctx, userId);
    if (denied) return denied;
  }

  const history = await SubscriptionHistory.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json({ history });
}

export const GET = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
