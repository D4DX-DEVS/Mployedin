import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { Employer } from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { notificationUpdateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

/**
 * GET /api/notifications
 * Returns paginated notifications for the current user
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10")));
  const unreadOnly = searchParams.get("unread") === "true" || searchParams.get("unreadOnly") === "true";

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

  // Notifications historically stored only the entity id in `meta`. Resolve
  // the optional actor photo at read time so old notifications immediately
  // benefit from profile uploads without requiring a data migration.
  const metadata = items.map((item) => (item.meta && typeof item.meta === "object" ? item.meta as Record<string, unknown> : {}));
  const userIds = metadata
    .flatMap((meta) => [meta.actorId, meta.actorUserId, meta.agentUserId, meta.userId])
    .filter((id): id is string => typeof id === "string" && mongoose.isValidObjectId(id));
  const employerIds = metadata
    .map((meta) => meta.employerId)
    .filter((id): id is string => typeof id === "string" && mongoose.isValidObjectId(id));
  const [actorUsers, employers] = await Promise.all([
    userIds.length > 0 ? User.find({ _id: { $in: [...new Set(userIds)] } }).select("name email avatar").lean() : [],
    employerIds.length > 0 ? Employer.find({ _id: { $in: [...new Set(employerIds)] } }).select("userId logo companyName").lean() : [],
  ]);
  const employerUserIds = employers.map((employer) => String(employer.userId));
  const employerUsers = employerUserIds.length > 0
    ? await User.find({ _id: { $in: employerUserIds } }).select("name email avatar").lean()
    : [];
  const userMap = new Map([...actorUsers, ...employerUsers].map((user) => [String(user._id), user]));
  const employerMap = new Map(employers.map((employer) => [String(employer._id), employer]));
  const enriched = items.map((item, index) => {
    const meta = { ...metadata[index] };
    const actorId = [meta.actorId, meta.actorUserId, meta.agentUserId, meta.userId]
      .find((id): id is string => typeof id === "string" && userMap.has(id));
    const actor = actorId ? userMap.get(actorId) : undefined;
    const employer = typeof meta.employerId === "string" ? employerMap.get(meta.employerId) : undefined;
    const employerUser = employer ? userMap.get(String(employer.userId)) : undefined;
    if (actor) {
      meta.actorName = actor.name;
      meta.actorEmail = actor.email;
      if (actor.avatar) meta.actorAvatar = actor.avatar;
    } else if (employer || employerUser) {
      meta.actorName = employerUser?.name ?? employer?.companyName;
      meta.actorEmail = employerUser?.email;
      meta.actorAvatar = employerUser?.avatar ?? employer?.logo;
    }
    return { ...item, meta };
  });

  return NextResponse.json({ notifications: enriched, total, page, totalPages: Math.ceil(total / limit), unreadCount });
});

/**
 * PATCH /api/notifications
 * Body: { ids: string[] } | { markAllRead: true }
 * Marks specified notifications (or all) as read
 */
export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const body = await validateBody(req, notificationUpdateSchema);

  if (body.markAllRead) {
    await Notification.updateMany({ userId: ctx.userId, isRead: false }, { isRead: true });
    await logActivity({ ...actorFromCtx(ctx), action: "notification.mark_all_read", resource: "notifications", req });
    return NextResponse.json({ success: true });
  }

  const { ids } = body as { ids: string[] };
  if (!ids?.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  await Notification.updateMany(
    { _id: { $in: ids }, userId: ctx.userId },
    { isRead: true, readAt: new Date() }
  );

  await logActivity({ ...actorFromCtx(ctx), action: "notification.mark_read", resource: "notifications", meta: { count: ids.length }, req });

  return NextResponse.json({ success: true, updated: ids.length });
});
