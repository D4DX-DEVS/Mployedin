/**
 * GET /api/admin/payments/status — read-only payment gateway status for the
 * admin settings page: provider, test/live mode (from the key prefix), which
 * keys are present (booleans only — never values), the webhook URL to paste
 * into the Stripe / Razorpay dashboard and the events to enable.
 *
 * Gateway configuration lives in environment variables (docs/PAYMENTS.md);
 * there is intentionally no write endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { getPaymentGatewayStatus } from "@/lib/payments";

async function getHandler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  return NextResponse.json({ status: getPaymentGatewayStatus(appUrl) });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
