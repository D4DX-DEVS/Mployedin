import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import NotificationPreference from "@/models/NotificationPreference";
import EmailLog from "@/models/EmailLog";

/**
 * GET /api/admin/notification-stats
 * Returns aggregate notification preference statistics + email delivery stats.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();
  const day24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const week7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalUsers, allPrefs, emailStats24h, emailStats7d] = await Promise.all([
    User.countDocuments({ isActive: true }),
    NotificationPreference.find({}).select("emailFrequency unsubscribedAll").lean(),
    EmailLog.aggregate([
      { $match: { sentAt: { $gte: day24h } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    EmailLog.aggregate([
      { $match: { sentAt: { $gte: week7d } } },
      { $group: { _id: "$source", count: { $sum: 1 } } },
    ]),
  ]);

  let unsubscribed = 0;
  let instantFrequency = 0;
  let dailyFrequency = 0;
  let weeklyFrequency = 0;

  for (const p of allPrefs) {
    if (p.unsubscribedAll) {
      unsubscribed++;
      continue;
    }
    switch (p.emailFrequency) {
      case "instant":
        instantFrequency++;
        break;
      case "daily":
        dailyFrequency++;
        break;
      case "weekly":
        weeklyFrequency++;
        break;
    }
  }

  const emailEnabled = totalUsers - unsubscribed;

  // Build email delivery stats
  const delivery24h: Record<string, number> = { sent: 0, failed: 0, bounced: 0, delivered: 0 };
  for (const s of emailStats24h) delivery24h[s._id] = s.count;

  const bySource7d: Record<string, number> = {};
  for (const s of emailStats7d) bySource7d[s._id] = s.count;

  return NextResponse.json({
    success: true,
    stats: {
      totalUsers,
      emailEnabled,
      unsubscribed,
      instantFrequency,
      dailyFrequency,
      weeklyFrequency,
      delivery24h,
      bySource7d,
    },
  });
});
