import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";

/**
 * GET /api/employers/activity-history
 *
 * Returns audit log entries for actions performed on behalf of the employer.
 *
 * Query params:
 *   page (default 1)
 *   limit (default 15, max 50)
 *   action (optional: "create" | "update" | "delete" | "start" | "exit")
 *   role (optional: "admin" | "super_agent" | "agent")
 */
async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "15", 10)));
  const actionFilter = url.searchParams.get("action");
  const roleFilter = url.searchParams.get("role");

  const employerIdStr = employer._id.toString();

  // Two entry points write into this account: /api/tenant/switch (agent, super_agent)
  // logs `tenant_view.*`, /api/admin/impersonate logs `impersonation.*`. Matching only
  // the first hid admins — the most privileged entrant — from the account owner.
  const ENTRY_PREFIXES = /^(tenant_view|impersonation)\./;

  const filter: Record<string, unknown> = {
    $or: [
      { action: { $regex: ENTRY_PREFIXES }, resourceId: employerIdStr },
      { action: { $regex: ENTRY_PREFIXES }, "meta.employerId": employerIdStr },
    ],
  };

  if (actionFilter && ["create", "update", "delete", "start", "exit"].includes(actionFilter)) {
    const actionMatch = { $in: [`tenant_view.${actionFilter}`, `impersonation.${actionFilter}`] };
    filter.$or = [
      { action: actionMatch, resourceId: employerIdStr },
      { action: actionMatch, "meta.employerId": employerIdStr },
    ];
  }

  if (roleFilter && ["admin", "super_agent", "agent"].includes(roleFilter)) {
    filter.actorRole = roleFilter;
  }

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  // Resolve actor names
  const actorIds = [...new Set(entries.map((e) => e.actorId?.toString()).filter(Boolean))];
  const actors = actorIds.length
    ? await User.find({ _id: { $in: actorIds } }).select("_id name email role").lean()
    : [];
  const actorMap = new Map(actors.map((a) => [a._id.toString(), { name: a.name, email: a.email, role: a.role }]));

  const items = entries.map((entry) => {
    const actor = entry.actorId ? actorMap.get(entry.actorId.toString()) : null;
    const meta = (entry.meta ?? {}) as Record<string, unknown>;
    // Strip whichever entry-point prefix the action carries (tenant_view.* from
    // /api/tenant/switch, impersonation.* from /api/admin/impersonate) so the UI's
    // action labels stay the same for both doors. The actor role badge already
    // tells the employer which kind of account came in.
    const action = entry.action.split(".").slice(1).join(".") || entry.action;
    const path = meta.path ? String(meta.path) : null;

    return {
      id: entry._id.toString(),
      actorName: actor?.name ?? "System",
      actorRole: entry.actorRole,
      actorEmail: actor?.email,
      action,
      method: meta.method ? String(meta.method) : null,
      path,
      ipAddress: entry.ipAddress,
      country: entry.country,
      createdAt: entry.createdAt,
    };
  });

  return NextResponse.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  });
}

export const GET = withAuth(getHandler);
