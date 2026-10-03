import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import WhatsAppTemplate from "@/models/WhatsAppTemplate";

interface AuthCtx { userId: string; role: string; locale: string }

/** GET /api/admin/whatsapp/templates?status=APPROVED — the synced template mirror. */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  const status = req.nextUrl.searchParams.get("status");
  const filter: Record<string, unknown> = {};
  if (status && /^[A-Z_]{3,32}$/.test(status)) filter.status = status;
  const templates = await WhatsAppTemplate.find(filter).sort({ name: 1, language: 1 }).lean();
  return NextResponse.json({ templates });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
