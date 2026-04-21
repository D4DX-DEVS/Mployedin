/**
 * GET /api/subscriptions/history?userId=xxx
 *
 * Returns subscription history. Admins can query any user; others see own only.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  let userId = searchParams.get("userId");

  // Non-admin can only see own history
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    userId = ctx.userId;
  }

  if (!userId) {
    return NextResponse.json(
      { error: "userId query param is required" },
      { status: 400 },
    );
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
