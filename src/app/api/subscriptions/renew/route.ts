/**
 * POST /api/subscriptions/renew
 *
 * Renew an expired or about-to-expire subscription.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { subscriptionRenewSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import { calcEndDate, nextUsageReset, initAiUsage } from "@/lib/subscription/helpers";
import Subscription from "@/models/Subscription";
import Invoice from "@/models/Invoice";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { Employer } from "@/models/Employer";
import { requireSubscriptionTargetAccess } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, subscriptionRenewSchema);

  const sub = await Subscription.findById(body.subscriptionId);
  if (!sub) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  // Agents/super-agents may only act on employers within their scope
  const scopeCheck = await requireSubscriptionTargetAccess(ctx, String(sub.userId));
  if (scopeCheck) return scopeCheck;

  if (!["active", "expired"].includes(sub.status)) {
    return NextResponse.json(
      { error: `Cannot renew a subscription with status "${sub.status}"` },
      { status: 400 },
    );
  }

  // Calculate new period
  const newStart = sub.status === "expired" ? new Date() : new Date(sub.endDate);
  const cycle = sub.planSnapshot?.billingCycle ?? "monthly";
  const newEnd = calcEndDate(newStart, cycle);

  // Update subscription
  sub.startDate = newStart;
  sub.endDate = newEnd;
  sub.status = "active";
  sub.usage = {
    activeJobs: 0,
    applicationsViewed: 0,
    applicationsSubmitted: 0,
    aiUsage: initAiUsage(),
  } as typeof sub.usage;
  sub.usageResetAt = nextUsageReset(newStart);
  await sub.save();

  // History
  await SubscriptionHistory.create({
    userId: sub.userId,
    subscriptionId: sub._id,
    action: "renewed",
    toPlanId: sub.planId,
    toPlanName: sub.planSnapshot?.name,
    performedBy: ctx.userId,
    performedByRole: ctx.role,
    reason: body.notes,
  });

  // Invoice
  const invoiceNumber = await generateInvoiceNumber();
  await Invoice.create({
    invoiceNumber,
    userId: sub.userId,
    subscriptionId: sub._id,
    planId: sub.planId,
    type: "renewal",
    planName: sub.planSnapshot?.name ?? "Unknown",
    description: `Renewal: ${sub.planSnapshot?.name} (${cycle})`,
    // Totals are derived from subtotal by Invoice.pre("save").
    subtotal: sub.planSnapshot?.price ?? 0,
    amount: sub.planSnapshot?.price ?? 0,
    currency: sub.planSnapshot?.currency ?? "AED",
    billingCycle: cycle,
    periodStart: newStart,
    periodEnd: newEnd,
    status: "issued",
    issuedAt: new Date(),
  });

  // Backward compat
  if (sub.targetRole === "employer") {
    await Employer.findOneAndUpdate(
      { userId: sub.userId },
      { paymentStatus: "active" },
    );
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "subscription.renew",
    resource: "subscriptions",
    resourceId: sub._id.toString(),
    meta: { userId: sub.userId.toString(), planName: sub.planSnapshot?.name },
    req,
  });

  return NextResponse.json({ subscription: sub });
}

export const POST = withAuth(handler, {
  resource: "subscriptions",
  action: "update",
});
