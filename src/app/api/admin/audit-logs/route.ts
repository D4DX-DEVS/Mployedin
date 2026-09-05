import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";
import { getSuperAgentTeamUserIds } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const resource = searchParams.get("resource") ?? "";
  const action = searchParams.get("action") ?? "";
  const actorId = searchParams.get("actorId") ?? "";
  const country = searchParams.get("country") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  /* `search` (actor name or email) and `actorRole` came from the separate
     activity-timeline page, which read this same AuditLog collection through a
     second endpoint. Neither filter set was a superset of the other, so
     "everything user X did last week" needed both pages: one had the name
     search, the other had the date range. */
  const search = searchParams.get("search")?.trim() ?? "";
  const actorRole = searchParams.get("actorRole") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  if (resource) query.resource = resource;
  if (action) query.action = new RegExp(escapeRegex(action), "i");
  if (actorId) query.actorId = actorId;
  if (country) query.country = country.toUpperCase();
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to + "T23:59:59.999Z");
  }
  if (actorRole) query.actorRole = actorRole;
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    const matchingUsers = await User.find({ $or: [{ name: rx }, { email: rx }] })
      .select("_id")
      .limit(100)
      .lean();
    // No match must mean "no rows", never "every row".
    query.actorId = { $in: matchingUsers.map((user) => user._id) };
  }

  // super_agent: restrict to their own + effective-scope agents' actions.
  // admin: unrestricted (existing behavior).
  if (ctx.role === "super_agent") {
    const teamUserIds = await getSuperAgentTeamUserIds(ctx.userId);
    if (actorId) {
      const inScope = teamUserIds.some((id) => String(id) === actorId);
      if (!inScope) {
        return NextResponse.json(
          { error: "Access restricted — you can only view audit logs for your own team." },
          { status: 403 },
        );
      }
      query.actorId = actorId;
    } else if (search) {
      // Intersect the name search with the team scope — a super-agent must not
      // widen their view by searching for someone outside it.
      const searched = (query.actorId as { $in?: unknown[] } | undefined)?.$in ?? [];
      const teamIds = new Set(teamUserIds.map(String));
      query.actorId = { $in: searched.filter((id) => teamIds.has(String(id))) };
    } else {
      query.actorId = { $in: teamUserIds };
    }
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("actorId", "name email role")
      // onBehalfOfId is what distinguishes "agent Ravi created a job" from
      // "agent Ravi created a job inside employer X's account". Without it the
      // table shows the two identically.
      .populate("onBehalfOfId", "name email role")
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  return NextResponse.json({
    logs,
    pagination: { page, limit, total, pages: limit > 0 ? Math.ceil(total / limit) : 1 },
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
