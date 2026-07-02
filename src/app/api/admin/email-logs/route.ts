import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import EmailLog from "@/models/EmailLog";

/**
 * GET /api/admin/email-logs
 * Returns paginated email delivery logs for admin dashboard.
 * Query params: page, limit, status, source, userId
 */

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const userId = url.searchParams.get("userId");

  const filter: Record<string, unknown> = {};
  if (status && ["sent", "failed", "bounced", "delivered"].includes(status)) {
    filter.status = status;
  }
  if (source) {
    filter.source = source;
  }
  if (userId) {
    filter.userId = userId;
  }

  const [logs, total, stats] = await Promise.all([
    EmailLog.find(filter)
      .sort({ sentAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    EmailLog.countDocuments(filter),
    // Aggregate stats for the last 24h
    EmailLog.aggregate([
      { $match: { sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Build stats summary
  const statsSummary: Record<string, number> = {
    sent: 0,
    failed: 0,
    bounced: 0,
    delivered: 0,
  };
  for (const s of stats) {
    statsSummary[s._id] = s.count;
  }

  return NextResponse.json({
    success: true,
    logs,
    pagination: { page, limit, total, totalPages: limit > 0 ? Math.ceil(total / limit) : 1 },
    stats24h: statsSummary,
  });
});
