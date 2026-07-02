/**
 * POST /api/subscriptions/checkout
 *
 * Subscription upgrade checkout stub.
 *
 * Currently returns a structured "not configured" response so the frontend
 * can show a meaningful message. When a payment gateway (Razorpay / Stripe)
 * is integrated, replace the handler body here — the API contract and
 * frontend integration remain the same.
 *
 * Expected request body:
 *   { planId: string }
 *
 * Future response (when payment is live):
 *   { checkoutUrl: string }  →  redirect user to payment gateway
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import { getPaymentGateway, isPaymentGatewayEnabled } from "@/lib/payments";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import { User } from "@/models/User";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  const targetRole =
    ctx.role === "employer"
      ? "employer"
      : ctx.role === "job_seeker"
        ? "job_seeker"
        : null;

  if (!targetRole) {
    return NextResponse.json({ error: "Not eligible for subscriptions" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { planId } = body as { planId?: string };

  if (!planId) {
    return NextResponse.json({ error: "planId is required" }, { status: 400 });
  }

  // Validate the plan exists and matches the role
  await connectDB();
  const plan = await SubscriptionPlan.findOne({
    _id: planId,
    targetRole,
    isActive: true,
  }).lean();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // ── Gateway configured → create a real checkout session ──────────────────
  // Fulfillment (subscription + paid invoice) happens in /api/payments/webhook
  // via the {userId, planId} metadata below.
  if (isPaymentGatewayEnabled()) {
    const user = await User.findById(ctx.userId).select("name email").lean();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const returnPath = `${baseUrl}/${ctx.locale}/${targetRole === "employer" ? "employer" : "job-seeker"}/subscription`;

    const session = await getPaymentGateway().createSession({
      invoiceId: "", // invoice is created post-payment by the webhook
      employerId: ctx.userId,
      amount: plan.price,
      currency: plan.currency,
      description: `Subscription: ${plan.name} (${plan.billingCycle})`,
      customerEmail: user?.email ?? "",
      customerName: user?.name ?? "",
      metadata: { userId: ctx.userId, planId: String(plan._id), targetRole },
      successUrl: `${returnPath}?payment=success`,
      cancelUrl: `${returnPath}?payment=cancelled`,
    });

    return NextResponse.json({
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
      provider: session.provider,
    });
  }

  // ── No gateway → structured response the UI handles gracefully ───────────
  return NextResponse.json(
    {
      error: "payment_gateway_not_configured",
      message:
        "Online payment is not yet available. Please contact your administrator to upgrade your plan.",
      plan: {
        id: String(plan._id),
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
      },
    },
    { status: 503 },
  );
}

export const POST = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
