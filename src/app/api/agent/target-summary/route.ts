/**
 * GET /api/agent/target-summary — the agent's three targets for the current
 * period, plus what is not counted yet (lib/targets/targetSummary).
 * No live kpi3 target today → 200 { profile: null }.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { buildTargetSummary } from "@/lib/targets/targetSummary";

interface AuthCtx { userId: string; role: string; locale: string }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const summary = await buildTargetSummary(ctx.userId, "agent");
  return NextResponse.json(summary ?? { profile: null });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
