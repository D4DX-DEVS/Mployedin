import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SystemConfig, { getSystemConfig } from "@/models/SystemConfig";
import { validateBody } from "@/lib/validators";
import { notificationUserOverrideCreateSchema, notificationUserOverrideDeleteSchema } from "@/lib/validators/settings";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

/**
 * POST /api/admin/notification-config/user-override
 * Add a user-level override (force-unsubscribe, pause, force-instant).
 * Body: { userId, action, reason }
 *
 * DELETE /api/admin/notification-config/user-override
 * Remove a user override.
 * Body: { userId }
 */

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, notificationUserOverrideCreateSchema);
  const { userId, action, reason } = body;

  await connectDB();

  // Remove existing override for this user, then add new one
  await SystemConfig.updateOne(
    { key: "notification_system" },
    { $pull: { userOverrides: { userId } } },
  );

  const config = await SystemConfig.findOneAndUpdate(
    { key: "notification_system" },
    {
      $push: {
        userOverrides: {
          userId,
          action,
          reason: reason.slice(0, 500),
          createdAt: new Date(),
          createdBy: ctx.userId,
        },
      },
      $set: { updatedBy: ctx.userId },
    },
    { new: true, upsert: true },
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "admin.user_override.create",
    resource: "settings",
    meta: { targetUserId: userId, action, reason },
    req,
  });

  return NextResponse.json({ success: true, config });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, notificationUserOverrideDeleteSchema);
  const { userId } = body;

  await connectDB();

  const config = await SystemConfig.findOneAndUpdate(
    { key: "notification_system" },
    {
      $pull: { userOverrides: { userId } },
      $set: { updatedBy: ctx.userId },
    },
    { new: true },
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "admin.user_override.delete",
    resource: "settings",
    meta: { targetUserId: userId },
    req,
  });

  return NextResponse.json({ success: true, config });
});
