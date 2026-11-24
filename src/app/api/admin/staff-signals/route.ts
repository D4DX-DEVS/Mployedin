import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { staffListSignals } from "@/lib/admin/staffReport/signals.server";
import logger from "@/lib/logger";

const MAX_IDS = 100;

/**
 * GET /api/admin/staff-signals?role=agent|super_agent&ids=a,b,c
 *
 * The Super Agents / Agents lists' extra columns for the rows on screen:
 * warnings count, working state, last activity, working agents of team.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const role = sp.get("role");
  if (role !== "agent" && role !== "super_agent") return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_IDS);
  try {
    return NextResponse.json({ signals: await staffListSignals(role, ids) });
  } catch (err) {
    logger.error({ err }, "[admin/staff-signals] Error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withAuth(handler);
