/**
 * GET /api/subscriptions/feature-gate
 *
 * Returns complete feature gate map for the current user.
 * Used by the client-side useFeatureGate() hook.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
// import { getFeatureGateMap } from "@/lib/subscription/featureGate"; // re-enable when payment gateway is ready
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  // All users get platinum-tier access until payment gateway is implemented
  // Return bypass: true so client-side useFeatureGate always returns allowed
  return NextResponse.json({ features: {}, bypass: true });
}

export const GET = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
