import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import { isValidObjectId } from "@/lib/security/sanitize";
import { canAccessLead } from "@/lib/leads/access";
import { getPresignedUrl } from "@/lib/storage/spaces";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/leads/[id]/poster — the hiring poster a lead was created from.
 * The file is private; anyone who may read the lead gets a short-lived link
 * (opened in the browser, not downloaded).
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  const id = req.nextUrl.pathname.split("/").at(-2);
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const lead = await Lead.findById(id).select("agentId superAgentId sourceFile").lean() as {
    agentId?: unknown; superAgentId?: unknown; sourceFile?: { key?: string; mimeType?: string };
  } | null;
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessLead(ctx, lead))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!lead.sourceFile?.key) return NextResponse.json({ error: "This lead has no poster" }, { status: 404 });

  const url = await getPresignedUrl(lead.sourceFile.key, 300, { inline: true, contentType: lead.sourceFile.mimeType });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
}, { resource: "leads", action: "read" });
