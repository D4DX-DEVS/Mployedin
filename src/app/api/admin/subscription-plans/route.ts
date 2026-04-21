import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import SubscriptionPlan from "@/models/SubscriptionPlan";
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

  return NextResponse.json({ plans });
}

/** POST — create a new subscription plan */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const body = await validateBody(req, subscriptionPlanCreateSchema);

  // If marked as default, unset other defaults for the same targetRole
  if (body.isDefault) {
    await SubscriptionPlan.updateMany(
      { targetRole: body.targetRole, isDefault: true },
      { $set: { isDefault: false } },
    );
  }

  const plan = await SubscriptionPlan.create({
    ...body,
    createdBy: ctx.userId,
  });

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
