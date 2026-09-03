import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import GdprRequest, { GDPR_REQUEST_STATUSES, GDPR_REQUEST_TYPES } from "@/models/GdprRequest";
import ConsentLog from "@/models/ConsentLog";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr — GDPR data-subject requests + stats           */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
  const search = url.searchParams.get("search") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const status = url.searchParams.get("status") ?? "";

  const filter: Record<string, unknown> = {};
  if (type && type !== "all" && (GDPR_REQUEST_TYPES as string[]).includes(type)) {
    filter.requestType = type;
  }
  if (status && status !== "all" && (GDPR_REQUEST_STATUSES as string[]).includes(status)) {
    filter.status = status;
  }
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { userName: { $regex: safe, $options: "i" } },
      { userEmail: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total, totalRequests, pendingRequests, completedRequests, responseAgg, totalUsers, consentAgg] =
    await Promise.all([
      GdprRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      GdprRequest.countDocuments(filter),
      GdprRequest.countDocuments({}),
      GdprRequest.countDocuments({ status: { $in: ["pending", "in_progress"] } }),
      GdprRequest.countDocuments({ status: "completed" }),
      GdprRequest.aggregate([
        { $match: { status: "completed", completedAt: { $ne: null } } },
        { $group: { _id: null, avgMs: { $avg: { $subtract: ["$completedAt", "$createdAt"] } } } },
      ]),
      User.countDocuments({ isActive: true }),
      // A consent is "active" when the latest entry for (user, consentType) is granted.
      ConsentLog.aggregate([
        { $sort: { createdAt: -1 } },
        { $group: { _id: { userId: "$userId", consentType: "$consentType" }, granted: { $first: "$granted" } } },
        { $match: { granted: true } },
        { $count: "activeConsents" },
      ]),
    ]);

  const avgMs = (responseAgg as Array<{ avgMs?: number }>)[0]?.avgMs ?? 0;
  const activeConsents = (consentAgg as Array<{ activeConsents?: number }>)[0]?.activeConsents ?? 0;

  const mapped = (items as Array<Record<string, unknown>>).map((item) => ({
    _id: String(item._id),
    userId: String(item.userId ?? ""),
    userName: item.userName ?? "Unknown",
    userEmail: item.userEmail ?? "",
    requestType: item.requestType,
    status: item.status,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    notes: item.notes,
  }));

  return NextResponse.json({
    items: mapped,
    total,
    stats: {
      totalRequests,
      pendingRequests,
      completedRequests,
      avgResponseDays: Math.round((avgMs / DAY_MS) * 10) / 10,
      dataSubjects: totalUsers,
      activeConsents,
    },
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
