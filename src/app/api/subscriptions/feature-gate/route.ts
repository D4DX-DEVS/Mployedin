/**
 * GET /api/subscriptions/feature-gate
 *
 * Returns complete feature gate map for the current user.
 * Used by the client-side useFeatureGate() hook.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { getFeatureGateMap } from "@/lib/subscription/featureGate";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  const targetRole =
    ctx.role === "employer"
      ? "employer"
      : ctx.role === "job_seeker"
        ? "job_seeker"
        : null;

  // Admin/agent roles get everything allowed
  if (!targetRole) {
    return NextResponse.json({ features: {}, bypass: true });
  }

  const features = await getFeatureGateMap(ctx.userId, targetRole);
  return NextResponse.json({ features, bypass: false });
}

export const GET = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
