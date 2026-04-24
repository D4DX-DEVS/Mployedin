import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr — GDPR data requests + stats                   */
/* ------------------------------------------------------------------ */

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

  /* Build query from audit logs with GDPR actions */
  const filter: Record<string, unknown> = {
    resource: "gdpr",
  };

  if (type && type !== "all") {
    filter.action = type;
  }

  if (status && status !== "all") {
    filter["details.status"] = status;
  }

  if (search) {
    filter.$or = [
      { "details.userName": { $regex: search, $options: "i" } },
      { "details.userEmail": { $regex: search, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  /* Compute stats */
  const [totalRequests, pendingRequests, completedRequests] = await Promise.all([
    AuditLog.countDocuments({ resource: "gdpr" }),
    AuditLog.countDocuments({ resource: "gdpr", "details.status": "pending" }),
    AuditLog.countDocuments({ resource: "gdpr", "details.status": "completed" }),
  ]);

  const totalUsers = await User.countDocuments({ isActive: true });

  /* Map audit logs to GDPR request shape */
  const mapped = items.map((item: Record<string, unknown>) => ({
    _id: String(item._id),
    userId: String(item.userId ?? ""),
    userName: (item.details as Record<string, unknown>)?.userName ?? "Unknown",
    userEmail: (item.details as Record<string, unknown>)?.userEmail ?? "",
    requestType: item.action ?? "export",
    status: (item.details as Record<string, unknown>)?.status ?? "completed",
    createdAt: item.createdAt,
    completedAt: (item.details as Record<string, unknown>)?.completedAt,
    notes: (item.details as Record<string, unknown>)?.notes,
  }));

  return NextResponse.json({
    items: mapped,
    total,
    stats: {
      totalRequests,
      pendingRequests,
      completedRequests,
      avgResponseDays: totalRequests > 0 ? Math.round((completedRequests / Math.max(totalRequests, 1)) * 3) : 0,
      dataSubjects: totalUsers,
      activeConsents: totalUsers,
    },
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
