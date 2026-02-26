import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Notification from "@/models/Notification";

/**
 * GET /api/notifications
 * Returns paginated notifications for the current user
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const unreadOnly = searchParams.get("unread") === "true";

  const filter: Record<string, unknown> = { userId: ctx.userId };
  if (unreadOnly) filter.isRead = false;

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: ctx.userId, isRead: false }),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit), unreadCount });
});

/**
 * PATCH /api/notifications
 * Body: { ids: string[] } | { markAllRead: true }
 * Marks specified notifications (or all) as read
 */
export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const body = await req.json();

  if (body.markAllRead) {
    await Notification.updateMany({ userId: ctx.userId, isRead: false }, { isRead: true });
    return NextResponse.json({ success: true });
  }

  const { ids } = body as { ids: string[] };
  if (!ids?.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  await Notification.updateMany(
    { _id: { $in: ids }, userId: ctx.userId },
    { isRead: true, readAt: new Date() }
  );

  return NextResponse.json({ success: true, updated: ids.length });
});
