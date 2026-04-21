/**
 * POST /api/subscriptions/bulk-assign
 *
 * Admin/super-agent bulk-assigns a subscription plan to multiple users.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import {
  calcEndDate,
  nextUsageReset,
  initAiUsage,
  buildPlanSnapshot,
  tierToLegacyType,
} from "@/lib/subscription/helpers";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import Invoice from "@/models/Invoice";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import { User } from "@/models/User";
import { Employer } from "@/models/Employer";
import type { UserRole } from "@/types/user";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

const bulkAssignSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(100),
  planId: z.string().min(1),
  autoRenew: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, bulkAssignSchema);

  // Look up the plan
  const plan = await SubscriptionPlan.findById(body.planId).lean();
  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: "Plan not found or inactive" }, { status: 404 });
  }

  const results: Array<{ userId: string; status: "assigned" | "skipped" | "error"; reason?: string }> = [];

  for (const userId of body.userIds) {
    try {
      // Verify user exists and role matches
      const user = await User.findById(userId).lean();
      if (!user) {
        results.push({ userId, status: "skipped", reason: "User not found" });
        continue;
      }
      if (user.role !== plan.targetRole) {
        results.push({ userId, status: "skipped", reason: `Role mismatch: ${user.role} vs ${plan.targetRole}` });
        continue;
      }

      // Check existing active subscription
      const existing = await Subscription.findOne({
        userId,
        targetRole: plan.targetRole,
        status: "active",
      }).lean();

      if (existing) {
        results.push({ userId, status: "skipped", reason: "Already has active subscription" });
        continue;
      }

      const startDate = new Date();
      const endDate = calcEndDate(startDate, plan.billingCycle);

      const subscription = await Subscription.create({
        userId,
        targetRole: plan.targetRole,
        planId: plan._id,
        planSnapshot: buildPlanSnapshot(plan),
        status: "active",
        startDate,
        endDate,
        autoRenew: body.autoRenew ?? false,
        usage: {
          activeJobs: 0,
          applicationsViewed: 0,
          applicationsSubmitted: 0,
          aiUsage: initAiUsage(),
        },
        usageResetAt: nextUsageReset(startDate),
        assignedBy: ctx.userId,
        assignedByRole: ctx.role,
        notes: body.notes ?? "Bulk assigned",
      });

      await SubscriptionHistory.create({
        userId,
        subscriptionId: subscription._id,
        action: "assigned",
        toPlanId: plan._id,
        toPlanName: plan.name,
        performedBy: ctx.userId,
        performedByRole: ctx.role,
        reason: body.notes ?? "Bulk assigned",
      });

      // Invoice only for paid plans
      if (plan.price > 0) {
        const invoiceNumber = await generateInvoiceNumber();
        await Invoice.create({
          invoiceNumber,
          userId,
          subscriptionId: subscription._id,
          planId: plan._id,
          type: "new",
          planName: plan.name,
          description: `New subscription: ${plan.name} (${plan.billingCycle})`,
          amount: plan.price,
          currency: plan.currency,
          billingCycle: plan.billingCycle,
          periodStart: startDate,
          periodEnd: endDate,
          status: "issued",
          issuedAt: new Date(),
        });
      }

      // Backward compat
      if (plan.targetRole === "employer") {
        await Employer.findOneAndUpdate(
          { userId },
          { paymentStatus: "active", subscriptionType: tierToLegacyType(plan.tier) },
        );
      }

      results.push({ userId, status: "assigned" });
    } catch {
      results.push({ userId, status: "error", reason: "Unexpected error" });
    }
  }

  const assigned = results.filter((r) => r.status === "assigned").length;

  await logActivity({
    ...actorFromCtx(ctx),
    action: "subscription.bulk_assign",
    resource: "subscriptions",
    resourceId: body.planId,
    meta: {
      planName: plan.name,
      totalRequested: body.userIds.length,
      assigned,
      skipped: results.filter((r) => r.status === "skipped").length,
    },
    req,
  });

  return NextResponse.json({
    assigned,
    total: body.userIds.length,
    results,
  });
}

export const POST = withAuth(handler, {
  resource: "subscriptions",
  action: "create",
});
