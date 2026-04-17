import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SystemConfig, { getSystemConfig } from "@/models/SystemConfig";

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

  const body = await req.json();
  const { userId, action, reason } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (!["force_unsubscribe", "force_instant", "pause_emails"].includes(action)) {
    return NextResponse.json({ error: "action must be force_unsubscribe, force_instant, or pause_emails" }, { status: 400 });
  }
  if (!reason || typeof reason !== "string") {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }

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

  return NextResponse.json({ success: true, config });
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { userId } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  await connectDB();

  const config = await SystemConfig.findOneAndUpdate(
    { key: "notification_system" },
    {
      $pull: { userOverrides: { userId } },
      $set: { updatedBy: ctx.userId },
    },
    { new: true },
  );

  return NextResponse.json({ success: true, config });
});
