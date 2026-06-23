/**
 * GET /api/subscriptions/plans?role=employer|job_seeker
 *
 * Returns active subscription plans for the given role.
 * Public shape — no admin-only fields exposed.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, _ctx: AuthCtx) {
  await connectDB();

  const role = req.nextUrl.searchParams.get("role");
  if (role !== "employer" && role !== "job_seeker") {
    return NextResponse.json(
      { error: "role must be employer or job_seeker" },
      { status: 400 },
    );
  }

  const plans = await SubscriptionPlan.find(
    { targetRole: role, isActive: true },
    {
      // Exclude admin fields
      createdBy: 0,
      __v: 0,
    },
  )
    .sort({ sortOrder: 1, tier: 1 })
    .lean();

  return NextResponse.json({ plans });
}

export const GET = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
