/**
 * GET/POST /api/super-agent/employers/[id]/agent-rate — [id] is the employer's
 * USER id. A super agent reads and sets the agent commission rate only for
 * employers whose agent is in their team (Agent.superAgentId; anything else is
 * a 404), and never while an admin rate is in effect or still to come
 * (lib/commissions/employerRateHistory).
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import {
  appendEmployerRate,
  employerRateView,
  isLockedByAdmin,
  setEmployerRateSchema,
  type StoredRateChange,
} from "@/lib/commissions/employerRateHistory";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";

interface AuthCtx { userId: string; role: string; locale: string }
type LeanEmployer = { _id: unknown; userId: unknown; agentId?: unknown; agentCommissionRates?: StoredRateChange[] };

/** The employer, only when its agent is in this super agent's team; otherwise null. */
async function teamEmployer(saUserId: string, employerUserId: string): Promise<LeanEmployer | null> {
  const [sa, employer] = await Promise.all([
    SuperAgent.findOne({ userId: saUserId }).select("_id").lean<{ _id: unknown }>(),
    Employer.findOne({ userId: employerUserId }).select("_id userId agentId agentCommissionRates").lean<LeanEmployer>(),
  ]);
  if (!sa || !employer?.agentId) return null;
  const inTeam = await Agent.exists({ _id: employer.agentId, superAgentId: sa._id });
  return inTeam ? employer : null;
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "super_agent") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid employer ID" }, { status: 400 });
  await connectDB();
  const employer = await teamEmployer(ctx.userId, params!.id);
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  return NextResponse.json(employerRateView(employer.agentCommissionRates));
}

async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "super_agent") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid employer ID" }, { status: 400 });
  await connectDB();
  const body = await validateBody(req, setEmployerRateSchema);
  const employer = await teamEmployer(ctx.userId, params!.id);
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const history = employer.agentCommissionRates ?? [];
  if (isLockedByAdmin(history)) {
    return NextResponse.json({ error: "Admin has set this rate" }, { status: 403 });
  }
  const before = employerRateView(history).current;
  if (!(await appendEmployerRate(String(employer._id), body, { userId: ctx.userId, role: "super_agent" }))) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }
  await logActivity({
    ...actorFromCtx(ctx),
    action: "commission_rate.employer_set",
    resource: "commissions",
    resourceId: String(employer.userId),
    changes: { before: { rate: "rate" in before ? before.rate : null }, after: { rate: body.rate } },
    meta: { reason: body.reason, effectiveFrom: body.effectiveFrom, setByRole: "super_agent" },
    req,
  });
  const fresh = await Employer.findById(employer._id).select("agentCommissionRates").lean<{ agentCommissionRates?: StoredRateChange[] }>();
  return NextResponse.json(employerRateView(fresh?.agentCommissionRates), { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
