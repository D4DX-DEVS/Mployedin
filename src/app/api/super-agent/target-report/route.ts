import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import { getSuperAgentTeam } from "@/lib/auth/agentRestrictions";
import { loadTargetReport } from "@/lib/targets/loadReport";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/super-agent/target-report?year=                          */
/*  The super agent's own profit report, with their team underneath.   */
/*                                                                     */
/*  GET  /api/super-agent/target-report?year=&agentId=                 */
/*  One of their agents' reports. `agentId` is the agent's USER id and */
/*  must belong to this super agent's team; nobody else's agent is     */
/*  reachable from here.                                               */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const agentId = searchParams.get("agentId");

  if (agentId) {
    if (!isValidObjectId(agentId)) return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });

    const team = await getSuperAgentTeam(ctx.userId);
    if (!team || !team.agentUserIds.some((id) => String(id) === agentId)) {
      return NextResponse.json({ error: "That agent is not in your team" }, { status: 403 });
    }

    const agentProfile = await TargetProfile.findOne({
      ...PROFIT_TARGET_FILTER,
      assigneeId: agentId,
      assigneeRole: "agent",
      year,
      status: { $ne: "cancelled" },
    }).lean();

    return NextResponse.json({ year, report: agentProfile ? await loadTargetReport(agentProfile) : null });
  }

  const ownProfile = await TargetProfile.findOne({
    ...PROFIT_TARGET_FILTER,
    assigneeId: ctx.userId,
    assigneeRole: "super_agent",
    year,
    status: { $ne: "cancelled" },
  }).lean();

  return NextResponse.json({
    year,
    report: ownProfile ? await loadTargetReport(ownProfile, { includeTeam: true }) : null,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
