import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { isValidObjectId } from "@/lib/security/sanitize";
import { buildStaffReport } from "@/lib/admin/staffReport/build.server";
import { parseRange } from "@/lib/admin/staffReport/range";
import { fileBase, reportCsvZip, reportPdf, reportTranslator } from "@/lib/admin/staffReport/export.server";
import { regionLocale } from "@/lib/agents/assignedRegion";
import logger from "@/lib/logger";

export const runtime = "nodejs";

/**
 * GET /api/admin/agents/:id/report/download?format=pdf|csv&range=&from=&to=&locale=
 *
 * The report as a printable PDF (top rows per table) or a zip of CSVs.
 * Admin only.
 */
async function handler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format");
  if (format !== "pdf" && format !== "csv") return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  try {
    const locale = regionLocale(sp.get("locale"), ctx.locale ?? "en");
    const range = parseRange({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
    const report = await buildStaffReport("agent", params!.id, range, locale);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const t = await reportTranslator(locale);
    const name = fileBase(report);
    const body = format === "pdf" ? reportPdf(report, t, locale) : await reportCsvZip(report, t);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.${format === "pdf" ? "pdf" : "zip"}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err }, "[admin/agents/report/download] Error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withAuth(handler);
