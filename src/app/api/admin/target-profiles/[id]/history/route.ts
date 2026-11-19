import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";

interface AuthCtx { userId: string; role: string; locale: string; }

interface AuditLogEntry {
  _id: unknown;
  action: string;
  actorName: string;
  actorRole: string;
  createdAt: Date;
  changes?: { before: Record<string, unknown>; after: Record<string, unknown> };
  meta?: { reason?: string; [key: string]: unknown };
}

async function getHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  const pageStr = req.nextUrl.searchParams.get("page") || "1";
  const limitStr = req.nextUrl.searchParams.get("limit") || "20";
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 20));

  // Import AuditLog model
  const AuditLog = require("@/models/AuditLog").default;

  const filter = {
    resource: "targets",
    resourceId: id,
  };

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as Promise<AuditLogEntry[]>,
    AuditLog.countDocuments(filter),
  ]);

  const history = entries.map((entry) => ({
    id: String(entry._id),
    action: entry.action,
    actorName: entry.actorName,
    actorRole: entry.actorRole,
    createdAt: entry.createdAt.toISOString(),
    changes: entry.changes,
    reason: entry.meta?.reason,
  }));

  return NextResponse.json({
    history,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

export const GET = withAuth(getHandler, { resource: "targets", action: "read" });
