import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import AuditLog from "@/models/AuditLog";
import { escapeRegex } from "@/lib/security/sanitize";
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

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("actorId", "name email role")
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  return NextResponse.json({
    logs,
    pagination: { page, limit, total, pages: limit > 0 ? Math.ceil(total / limit) : 1 },
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
