import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import SubscriptionPlan, { type ISubscriptionPlan } from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import { validateBody } from "@/lib/validators";
import { subscriptionPlanCreateSchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/** GET — list all subscription plans (optionally filtered by targetRole, isActive) */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const targetRole = searchParams.get("targetRole");
  const isActive = searchParams.get("isActive");

  const filter: Record<string, unknown> = {};
  if (targetRole) filter.targetRole = targetRole;
  if (isActive !== null && isActive !== undefined && isActive !== "") {
    filter.isActive = isActive === "true";
  }

  const plans = await SubscriptionPlan.find(filter)
    .sort({ targetRole: 1, sortOrder: 1, tier: 1 })
    .lean();

  /**
   * How many subscriptions point at each plan, any status.
   *
   * The list needs this to know whether a plan can be destroyed: without it the
   * UI offered "Delete permanently" on every inactive plan and only discovered
   * it was impossible after the admin had confirmed a scary dialog. One grouped
   * count is cheaper than a countDocuments per row.
   */
  const counts = await Subscription.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { planId: { $in: plans.map((p) => p._id) } } },
    { $group: { _id: "$planId", count: { $sum: 1 } } },
  ]);
  const countByPlan = new Map(counts.map((c) => [String(c._id), c.count]));

  return NextResponse.json({
    plans: plans.map((p) => ({
      ...p,
      subscriptionCount: countByPlan.get(String(p._id)) ?? 0,
    })),
  });
}

/** POST — create a new subscription plan */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const body = await validateBody(req, subscriptionPlanCreateSchema);

  let plan: ISubscriptionPlan;
  const session = await mongoose.startSession();
  try {
    const transactionPlan = await session.withTransaction(async () => {
      if (body.isDefault) {
        await SubscriptionPlan.updateMany(
          { targetRole: body.targetRole, isDefault: true },
          { $set: { isDefault: false } },
          { session },
        );
      }
      const [createdPlan] = await SubscriptionPlan.create(
        [{ ...body, createdBy: ctx.userId }],
        { session },
      );
      return createdPlan;
    });
    if (!transactionPlan) throw new Error("PLAN_TRANSACTION_NOT_COMMITTED");
    plan = transactionPlan;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: number }).code === 11000) {
      return NextResponse.json(
        { error: "Another default plan was selected concurrently. Please retry." },
        { status: 409 },
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
  await logActivity({
    ...actorFromCtx(ctx),
    action: "subscription_plan.create",
    resource: "subscriptions",
    resourceId: plan._id.toString(),
    meta: { name: body.name, targetRole: body.targetRole, tier: body.tier },
    req,
  });

  return NextResponse.json({ plan }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "subscriptions", action: "read" });
export const POST = withAuth(postHandler, { resource: "subscriptions", action: "create" });
