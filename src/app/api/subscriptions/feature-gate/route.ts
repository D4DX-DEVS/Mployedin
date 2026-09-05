/**
 * GET /api/subscriptions/feature-gate
 *
 * Returns complete feature gate map for the current user.
 * Used by the client-side useFeatureGate() hook.
 *
 * While the global `SystemSettings.subscriptionEnforcementEnabled` flag is OFF
 * (the default until payment integration lands) this returns `bypass: true` so
 * the client treats every feature as allowed. Once an admin flips the flag on,
 * the real per-plan map is returned — previously this route hard-coded the
 * bypass, so server gates would start rejecting while the UI still showed every
 * feature as unlocked.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { getFeatureGateMap } from "@/lib/subscription/featureGate";
import { isSubscriptionEnforcementEnabled } from "@/lib/subscription/enforcementFlag";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

/** Roles that are never gated — see BYPASS_ROLES in lib/subscription. */
const BYPASS_ROLES: UserRole[] = ["admin", "super_agent", "agent"];

async function handler(_req: NextRequest, ctx: AuthCtx) {
  if (!(await isSubscriptionEnforcementEnabled()) || BYPASS_ROLES.includes(ctx.role)) {
    return NextResponse.json({ features: {}, bypass: true });
  }

  const targetRole = ctx.role === "employer" ? "employer" : "job_seeker";
  const features = await getFeatureGateMap(ctx.userId, targetRole);

  return NextResponse.json({ features, bypass: false });
}

export const GET = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
