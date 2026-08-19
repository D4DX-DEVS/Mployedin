import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import AuditLog, { type IAuditLog } from "@/models/AuditLog";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";

type AuditLogFilter = {
  resource?: string;
  actorId?: { $in: unknown[] };
  actorRole?: string;
};

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

  const filter: AuditLogFilter = {};

  if (resource && resource !== "all") {
    filter.resource = resource;
  }

  if (search) {
    const safe = escapeRegex(search);
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ],
    }).select("_id").lean();

    if (matchingUsers.length === 0) {
      return NextResponse.json({ items: [], total: 0 });
    }

    filter.actorId = { $in: matchingUsers.map((user) => user._id) };
  }

  if (role && role !== "all") {
    filter.actorRole = role;
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("actorId", "name email role")
      .populate("onBehalfOfId", "name email role")
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  const mapped = items.map((item: Record<string, unknown>) => {
    const actor = item.actorId as Record<string, unknown> | null;
    // Set when the actor was inside someone else's account (tenant view /
    // impersonation). Without it "agent Ravi — job.create" is ambiguous.
    const onBehalfOf = item.onBehalfOfId as Record<string, unknown> | null;
    return {
      _id: String(item._id),
      userId: actor?._id ? String(actor._id) : item.actorId ? String(item.actorId) : "system",
      userName: actor?.name ?? "System",
      userEmail: actor?.email ?? "",
      userRole: actor?.role ?? item.actorRole ?? "system",
      action: item.action ?? "",
      resource: item.resource ?? "",
      resourceId: item.resourceId ? String(item.resourceId) : undefined,
      onBehalfOfName: onBehalfOf?.name ?? undefined,
      onBehalfOfEmail: onBehalfOf?.email ?? undefined,
      onBehalfOfRole: onBehalfOf?.role ?? item.onBehalfOfRole ?? undefined,
      details: item.meta ?? item.changes,
      ipAddress: item.ipAddress,
      createdAt: item.createdAt,
    };
  });

  return NextResponse.json({ items: mapped, total });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
