import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import WhatsAppMessageLog, { WHATSAPP_MESSAGE_STATUSES, WHATSAPP_SOURCES } from "@/models/WhatsAppMessageLog";
import { redactSecrets } from "@/lib/communications/whatsapp/redact";

interface AuthCtx { userId: string; role: string; locale: string }

const STATUSES: readonly string[] = WHATSAPP_MESSAGE_STATUSES;
const SOURCES: readonly string[] = WHATSAPP_SOURCES;
/** Past this the skip is both useless (the TTL keeps 90 days) and an unbounded scan. */
const MAX_PAGE = 10_000;

/** GET /api/admin/whatsapp/logs?page&limit&status&source&userId — mirrors /api/admin/email-logs. */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const sp = req.nextUrl.searchParams;
  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1));
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "30", 10) || 30));
  const filter: Record<string, unknown> = {};
  const status = sp.get("status");
  const source = sp.get("source");
  const userId = sp.get("userId");
  if (status && STATUSES.includes(status)) filter.status = status;
  if (source && SOURCES.includes(source)) filter.source = source;
  if (userId && /^[0-9a-f]{24}$/i.test(userId)) filter.userId = userId;

  const [rows, total] = await Promise.all([
    WhatsAppMessageLog.find(filter).sort({ sentAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WhatsAppMessageLog.countDocuments(filter),
  ]);

  // errorMessage is stored as the send attempt produced it; scrub it on the way out, as the status and test routes do.
  const logs = (rows as Array<{ errorMessage?: string }>).map((row) => (row.errorMessage ? { ...row, errorMessage: redactSecrets(row.errorMessage) } : row));

  return NextResponse.json({ success: true, logs, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
