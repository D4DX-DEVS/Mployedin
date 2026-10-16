import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import { loadTargetReport } from "@/lib/targets/loadReport";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/agent/target-report?year=                                */
/*  An agent's own profit report. There is no way to ask for anyone    */
/*  else's: the profile is always looked up by the signed-in user.     */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;

  const profile = await TargetProfile.findOne({
    ...PROFIT_TARGET_FILTER,
    assigneeId: ctx.userId,
    assigneeRole: "agent",
    year,
    status: { $ne: "cancelled" },
  }).lean();

  return NextResponse.json({ year, report: profile ? await loadTargetReport(profile) : null });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
