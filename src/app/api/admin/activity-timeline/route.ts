import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import AuditLog from "@/models/AuditLog";
import { escapeRegex } from "@/lib/security/sanitize";

/* ------------------------------------------------------------------ */
/*  GET /api/admin/activity-timeline — User activity timeline          */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const search = url.searchParams.get("search") ?? "";
  const resource = url.searchParams.get("resource") ?? "";
  const role = url.searchParams.get("role") ?? "";

  const filter: Record<string, unknown> = {};

  if (resource && resource !== "all") {
    filter.resource = resource;
  }

  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { "userSnapshot.fullName": { $regex: safe, $options: "i" } },
      { "userSnapshot.email": { $regex: safe, $options: "i" } },
    ];
  }

  if (role && role !== "all") {
    filter["userSnapshot.role"] = role;
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "fullName email role")
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  const mapped = items.map((item: Record<string, unknown>) => {
    const user = item.userId as Record<string, unknown> | null;
    return {
      _id: String(item._id),
      userId: user?._id ? String(user._id) : String(item.userId),
      userName: user?.fullName ?? (item.userSnapshot as Record<string, unknown>)?.fullName ?? "Unknown",
      userEmail: user?.email ?? (item.userSnapshot as Record<string, unknown>)?.email ?? "",
      userRole: user?.role ?? (item.userSnapshot as Record<string, unknown>)?.role ?? "",
      action: item.action ?? "",
      resource: item.resource ?? "",
      resourceId: item.resourceId ? String(item.resourceId) : undefined,
      details: item.details,
      ipAddress: item.ipAddress,
      createdAt: item.createdAt,
    };
  });

  return NextResponse.json({ items: mapped, total });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
