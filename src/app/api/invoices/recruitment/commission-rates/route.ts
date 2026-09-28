/**
 * GET /api/invoices/recruitment/commission-rates?jobId=
 *
 * The commission rates a recruitment invoice for this job will use, so the
 * invoice form previews what the server applies: a country rule for the
 * employer's country replaces the agent's / super-agent's profile rate.
 * Mirrors POST /api/invoices/recruitment when no manual override is sent.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import { resolveCommissionRate, resolveOverrideRate, type ResolvedRate } from "@/lib/commissions/resolveRate";
import { recruitmentJobAccessError } from "@/lib/invoices/recruitmentJobAccess";
import { isValidObjectId } from "@/lib/security/sanitize";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

export interface InvoiceCommissionRate extends ResolvedRate {
  /** The rate on the agent's / super-agent's profile, before any country rule. */
  profileRate: number;
}

/**
 * A 0% profile rate means no commission line at all — invoice creation skips
 * the line before any country rule is consulted, so the preview must too.
 */
async function lineRate(
  profileRate: number,
  country: string | null,
  resolve: typeof resolveCommissionRate,
  defaultSource: ResolvedRate["source"],
): Promise<InvoiceCommissionRate> {
  if (profileRate <= 0) return { rate: 0, source: defaultSource, profileRate: 0 };
  return { ...(await resolve(profileRate, country)), profileRate };
}

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!isValidObjectId(jobId)) {
    return NextResponse.json({ error: "Invalid job" }, { status: 400 });
  }

  await connectDB();

  const job = await Job.findById(jobId).select("agentId employerId").lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (await recruitmentJobAccessError(ctx, job.agentId)) {
    return NextResponse.json({ error: "You can't invoice this job" }, { status: 403 });
  }

  const [agentDoc, employer] = await Promise.all([
    job.agentId ? Agent.findById(job.agentId).select("commissionRate superAgentId").lean() : null,
    job.employerId ? Employer.findById(job.employerId).select("country").lean() : null,
  ]);
  const superAgentDoc = agentDoc?.superAgentId
    ? await SuperAgent.findById(agentDoc.superAgentId).select("overrideRate").lean()
    : null;
  const country = employer?.country ?? null;

  const [agent, superAgent] = await Promise.all([
    agentDoc ? lineRate(agentDoc.commissionRate ?? 0, country, resolveCommissionRate, "agent_default") : null,
    superAgentDoc ? lineRate(superAgentDoc.overrideRate ?? 0, country, resolveOverrideRate, "super_agent_default") : null,
  ]);

  return NextResponse.json({ agent, superAgent });
}

export const GET = withAuth(getHandler, { resource: "invoices", action: "create" });
