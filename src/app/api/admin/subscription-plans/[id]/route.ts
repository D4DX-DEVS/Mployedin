import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import { validateBody } from "@/lib/validators";
import { subscriptionPlanUpdateSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/** GET — get a single subscription plan by ID */
async function getHandler(
  _req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const plan = await SubscriptionPlan.findById(params?.id).lean();
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  return NextResponse.json({ plan });
}

/** PATCH — update a subscription plan */
async function patchHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const body = await validateBody(req, subscriptionPlanUpdateSchema);

  let plan = await SubscriptionPlan.findById(params?.id);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const targetRole = body.targetRole ?? plan.targetRole;
  const before = plan.toObject();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (body.isDefault) {
        await SubscriptionPlan.updateMany(
          { targetRole, isDefault: true, _id: { $ne: plan!._id } },
          { $set: { isDefault: false } },
          { session },
        );
      }
      const updated = await SubscriptionPlan.findByIdAndUpdate(
        plan!._id,
        { $set: body },
        { new: true, runValidators: true, session },
      );
      if (!updated) throw new Error("PLAN_NOT_FOUND_DURING_UPDATE");
      plan = updated;
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: number }).code === 11000) {
      return NextResponse.json(
        { error: "Another default plan was selected concurrently. Please retry." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "PLAN_NOT_FOUND_DURING_UPDATE") {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "subscription_plan.update",
    resource: "subscriptions",
    resourceId: plan._id.toString(),
    changes: { before, after: plan.toObject() },
    req,
  });

  return NextResponse.json({ plan });
}

/** DELETE — soft-delete a subscription plan (set isActive: false) */
async function deleteHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const plan = await SubscriptionPlan.findById(params?.id);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Prevent deletion if there are active subscriptions on this plan
  const activeCount = await Subscription.countDocuments({
    planId: plan._id,
    status: "active",
  });
  if (activeCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot deactivate plan — ${activeCount} active subscription(s) are using it`,
      },
      { status: 409 },
    );
  }

  plan.isActive = false;
  await plan.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "subscription_plan.delete",
    resource: "subscriptions",
    resourceId: plan._id.toString(),
    meta: { name: plan.name },
    req,
  });

  return NextResponse.json({ message: "Plan deactivated" });
}

export const GET = withAuth(getHandler, { resource: "subscriptions", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "subscriptions", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "subscriptions", action: "delete" });
