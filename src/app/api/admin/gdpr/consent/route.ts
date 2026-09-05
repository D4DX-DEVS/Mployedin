import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConsentLog from "@/models/ConsentLog";
import { escapeRegex } from "@/lib/security/sanitize";

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr/consent — consent change history               */
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

  const filter: Record<string, unknown> = {};
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { userName: { $regex: safe, $options: "i" } },
      { consentType: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    ConsentLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ConsentLog.countDocuments(filter),
  ]);

  const mapped = (items as Array<Record<string, unknown>>).map((c) => ({
    _id: String(c._id),
    userId: String(c.userId ?? ""),
    userName: c.userName ?? "Unknown",
    consentType: c.consentType,
    granted: Boolean(c.granted),
    timestamp: c.createdAt,
    ipAddress: c.ipAddress,
    source: c.source,
  }));

  return NextResponse.json({ items: mapped, total });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
