/**
 * GET /api/agent/employers/[id]/agent-rate — [id] is the employer's USER id.
 * An agent reads the commission rate of their own employers only
 * (Employer.agentId is their Agent; anything else is a 404). Read only.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { isValidObjectId } from "@/lib/security/sanitize";
import { employerRateView, type StoredRateChange } from "@/lib/commissions/employerRateHistory";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";

interface AuthCtx { userId: string; role: string; locale: string }

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "agent") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid employer ID" }, { status: 400 });
  await connectDB();
  const [agent, employer] = await Promise.all([
    Agent.findOne({ userId: ctx.userId }).select("_id").lean<{ _id: unknown }>(),
    Employer.findOne({ userId: params!.id })
      .select("agentId agentCommissionRates")
      .lean<{ agentId?: unknown; agentCommissionRates?: StoredRateChange[] }>(),
  ]);
  if (!agent || !employer || String(employer.agentId) !== String(agent._id)) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }
  const view = employerRateView(employer.agentCommissionRates);
  // Agents see each rate and when it starts, not who set it or why.
  return NextResponse.json({
    current: view.current,
    history: view.history.map((h) => ({ rate: h.rate, effectiveFrom: h.effectiveFrom })),
  });
}

export const GET = withAuth(getHandler);
