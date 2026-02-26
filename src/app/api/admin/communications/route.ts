import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { logActivity } from "@/lib/audit/log";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  if (req.method === "POST") {
    const { targetRole, targetAll, message, title, channel } = await req.json();

    if (!message || !title) {
      return NextResponse.json({ error: "title and message required" }, { status: 400 });
    }

    // Find target users
    const userQuery: Record<string, unknown> = { isActive: true };
    if (!targetAll && targetRole) {
      userQuery.role = targetRole;
    }

    const users = await User.find(userQuery).select("_id").lean();
    const recipientIds = users.map((u: { _id: unknown }) => u._id);

    // Create in-app notifications in bulk
    const notifications = recipientIds.map((userId: unknown) => ({
      userId,
      type: "system",
      title,
      message,
      channel: channel ?? "in_app",
      sentBy: ctx.userId,
    }));

    await Notification.insertMany(notifications, { ordered: false });

    await logActivity({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "communication.broadcast",
      resource: "notifications",
      meta: { title, targetRole: targetRole ?? "all", recipientCount: recipientIds.length },
      req,
    });

    return NextResponse.json({
      success: true,
      sent: recipientIds.length,
      message: `Broadcast sent to ${recipientIds.length} users`,
    });
  }

  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export const POST = withAuth(handler, { resource: "notifications", action: "create" });
