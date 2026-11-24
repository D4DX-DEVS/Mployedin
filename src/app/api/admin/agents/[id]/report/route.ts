import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { isValidObjectId } from "@/lib/security/sanitize";
import { buildStaffReport } from "@/lib/admin/staffReport/build.server";
import { parseRange } from "@/lib/admin/staffReport/range";
import { regionLocale } from "@/lib/agents/assignedRegion";
import logger from "@/lib/logger";

/**
 * GET /api/admin/agents/:id/report?range=&from=&to=&locale=   (:id = user id)
 *
 * Admin-only, read-only performance report (plan v2). Admin cannot enter a
 * staff account the way tenant view enters an employer's, so this is the view.
 */
async function handler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  try {
    const sp = new URL(req.url).searchParams;
    const range = parseRange({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
    const report = await buildStaffReport("agent", params!.id, range, regionLocale(sp.get("locale"), ctx.locale ?? "en"));
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ report });
  } catch (err) {
    logger.error({ err }, "[admin/agents/report] Error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withAuth(handler);
