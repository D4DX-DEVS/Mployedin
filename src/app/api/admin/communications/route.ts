import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { logActivity } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { communicationSchema } from "@/lib/validators/admin";
import { inngest } from "@/lib/inngest/client";

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
  // Broadcasting to all users (targetAll) is an admin-only superpower — a
  // super_agent/agent must never be able to mass-mail the whole platform.
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  if (req.method === "POST") {
    const { targetRoles, targetAll, message, title, channels } = await validateBody(req, communicationSchema);

    if (!message || !title) {
      return NextResponse.json({ error: "title and message required" }, { status: 400 });
    }

    const selectedChannels = channels ?? ["in_app"];

    // Count recipients cheaply (index-only) for the response; the actual
    // per-user notification + email fan-out is offloaded to Inngest so a
    // targetAll broadcast (100k+ users) never runs on the request path
    // (which would blow the serverless timeout + memory).
    const userQuery: Record<string, unknown> = { isActive: true };
    if (!targetAll && targetRoles && targetRoles.length > 0) {
      userQuery.role = targetRoles.length === 1 ? targetRoles[0] : { $in: targetRoles };
    }
    const recipientCount = await User.countDocuments(userQuery);

    await inngest.send({
      name: "admin/broadcast",
      data: { title, message, targetRoles, targetAll: Boolean(targetAll), channels: selectedChannels },
    });

    await logActivity({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "communication.broadcast",
      resource: "notifications",
      meta: { title, targetRoles: targetRoles ?? "all", recipientCount, channels: selectedChannels },
      req,
    });

    return NextResponse.json({
      success: true,
      sent: recipientCount,
      queued: true,
      message: `Broadcast queued for ${recipientCount} users`,
    });
  }

  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
export const POST = withAuth(handler, { resource: "notifications", action: "create" });
