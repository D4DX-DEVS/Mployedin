/**
 * GET/POST /api/admin/employers/[id]/agent-rate — [id] is the employer's USER id
 * (same as /api/employers/[id]/agent). Admin reads the effective-dated agent
 * commission rate of any employer and appends changes
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
  setEmployerRateSchema,
  type StoredRateChange,
} from "@/lib/commissions/employerRateHistory";
import Employer from "@/models/Employer";

interface AuthCtx { userId: string; role: string; locale: string }
type LeanEmployer = { _id: unknown; userId: unknown; agentCommissionRates?: StoredRateChange[] };

function loadEmployer(userId: string) {
  return Employer.findOne({ userId }).select("_id userId agentCommissionRates").lean<LeanEmployer>();
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid employer ID" }, { status: 400 });
  await connectDB();
  const employer = await loadEmployer(params!.id);
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  return NextResponse.json(employerRateView(employer.agentCommissionRates));
}

async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid employer ID" }, { status: 400 });
  await connectDB();
  const body = await validateBody(req, setEmployerRateSchema);
  const employer = await loadEmployer(params!.id);
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const before = employerRateView(employer.agentCommissionRates).current;
  if (!(await appendEmployerRate(String(employer._id), body, { userId: ctx.userId, role: "admin" }))) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }
  await logActivity({
    ...actorFromCtx(ctx),
    action: "commission_rate.employer_set",
    resource: "commissions",
    resourceId: String(employer.userId),
    changes: { before: { rate: "rate" in before ? before.rate : null }, after: { rate: body.rate } },
    meta: { reason: body.reason, effectiveFrom: body.effectiveFrom, setByRole: "admin" },
    req,
  });
  const fresh = await loadEmployer(params!.id);
  return NextResponse.json(employerRateView(fresh?.agentCommissionRates), { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
