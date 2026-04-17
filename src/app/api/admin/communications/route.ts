import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { logActivity } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { communicationSchema } from "@/lib/validators/admin";
import { sendEmail } from "@/lib/communications/email";

interface AuthCtx { userId: string; role: string; locale: string; }

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const history = await Notification.find({ type: "system" })
    .sort({ createdAt: -1 })
    .limit(200)
    .select("title body channels createdAt")
    .lean();

  // Deduplicate by title+createdAt (one broadcast creates many per-user records)
  const seen = new Set<string>();
  const broadcasts = history.filter((n) => {
    const key = `${n.title}:${String(n.createdAt)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ broadcasts });
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  if (req.method === "POST") {
    const { targetRoles, targetAll, message, title, channels } = await validateBody(req, communicationSchema);

    if (!message || !title) {
      return NextResponse.json({ error: "title and message required" }, { status: 400 });
    }

    // Find target users
    const userQuery: Record<string, unknown> = { isActive: true };
    if (!targetAll && targetRoles && targetRoles.length > 0) {
      userQuery.role = targetRoles.length === 1 ? targetRoles[0] : { $in: targetRoles };
    }

    const selectedChannels = channels ?? ["in_app"];

    // Fetch recipients — include email only if needed
    const needsEmail = selectedChannels.includes("email");
    const users = await User.find(userQuery).select(`_id${needsEmail ? " email name" : ""}`).lean() as Array<{ _id: unknown; email?: string; name?: string }>;
    const recipientIds = users.map((u) => u._id);

    // Create in-app notifications in bulk
    if (selectedChannels.includes("in_app")) {
      const notifications = recipientIds.map((userId) => ({
        userId,
        type: "system",
        title,
        body: message,
        channels: selectedChannels,
        isSent: true,
        sentAt: new Date(),
      }));
      await Notification.insertMany(notifications, { ordered: false });
    }

    // Dispatch emails
    if (needsEmail) {
      const emailPromises = users.map((u) => {
        if (!u.email) return Promise.resolve();
        return sendEmail({
          to: u.email,
          subject: title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;">
            <div style="background:#0a2a6e;padding:20px 24px;border-radius:6px 6px 0 0;text-align:center;margin-bottom:24px;">
              <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px;">MPLOYEDIN</h1>
            </div>
            <h2 style="color:#0a2a6e;margin:0 0 16px;">${title}</h2>
            <p style="color:#374151;font-size:15px;line-height:1.6;white-space:pre-wrap;">${message}</p>
          </div>`,
        }).catch((err: unknown) => {
          console.error(`[broadcast] email failed for ${u.email}:`, err);
        });
      });
      await Promise.allSettled(emailPromises);
    }

    // WhatsApp: no integration — channel stored in DB for future use

    await logActivity({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "communication.broadcast",
      resource: "notifications",
      meta: { title, targetRoles: targetRoles ?? "all", recipientCount: recipientIds.length, channels: selectedChannels },
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

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
export const POST = withAuth(handler, { resource: "notifications", action: "create" });
