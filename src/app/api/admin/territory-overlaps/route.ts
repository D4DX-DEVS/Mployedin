import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { findTerritoryOverlaps } from "@/lib/agents/territoryCoverage";
import logger from "@/lib/logger";

/**
 * GET /api/admin/territory-overlaps?role=super_agent|agent&cityIds=a,b&stateIds=c&exclude=<userId>
 *
 * Who else already covers part of a region an admin is about to assign. Several
 * super-agents (or agents) may share a region — they then all see the same
 * employers — so this never blocks the save; the Add/Edit dialogs show the
 * list so the overlap is a decision, not an accident.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const params = new URL(req.url).searchParams;
  const role = params.get("role");
  if (role !== "super_agent" && role !== "agent") {
    return NextResponse.json({ error: "role must be super_agent or agent" }, { status: 400 });
  }
  const split = (key: string) =>
    (params.get(key) ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);

  try {
    const overlaps = await findTerritoryOverlaps({
      role,
      cityIds: split("cityIds"),
      stateIds: split("stateIds"),
      excludeUserId: params.get("exclude"),
    });
    return NextResponse.json({ overlaps });
  } catch (err) {
    logger.error({ err }, "[admin/territory-overlaps] Error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withAuth(handler);
