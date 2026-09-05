import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { matchingWeightsSchema } from "@/lib/validators/misc";

import { sanitizeMatchingWeights } from "@/lib/ai/matchingWeights";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/jobs/[id]/matching-weights — get per-job weights (falls back to employer default)
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const job = await Job.findById(params!.id).select("employerId agentId matchingWeights").lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Authorization check
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(job.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    const ok = Boolean(
      agent && (
        String(job.agentId) === String(agent._id) ||
        ((agent.assignedEmployerIds as unknown[]) ?? []).some((e) => String(e) === String(job.employerId))
      )
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (ctx.role === "super_agent") {
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
    const agent = await Agent.findById(job.agentId).select("superAgentId").lean();
    const ok = Boolean(
      sa && agent && sa.agentIds?.map(String).includes(String(agent?.superAgentId))
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // If job has its own weights, return them
  if (job.matchingWeights && Object.keys(job.matchingWeights).length > 0) {
    return NextResponse.json({ weights: sanitizeMatchingWeights(job.matchingWeights), source: "job" });
  }

  // Fall back to employer-level weights
  const employer = await Employer.findById(job.employerId).select("matchingWeights").lean();
  return NextResponse.json({
    weights: sanitizeMatchingWeights(employer?.matchingWeights),
    source: "employer",
  });
}

// PATCH /api/jobs/[id]/matching-weights — save per-job weights
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const job = await Job.findById(params!.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Ownership check
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(job.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "agent") {
    // Agents must own the job or be assigned to its employer
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    const ok = Boolean(
      agent && (
        String(job.agentId) === String(agent._id) ||
        ((agent.assignedEmployerIds as unknown[]) ?? []).some((e) => String(e) === String(job.employerId))
      )
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (ctx.role === "super_agent") {
    // Super agents must be assigned to the job's agent
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
    const agent = await Agent.findById(job.agentId).select("superAgentId").lean();
    const ok = Boolean(
      sa && agent && sa.agentIds?.map(String).includes(String(agent?.superAgentId))
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, matchingWeightsSchema);
  const { weights } = body;

  // Validate total = 100
  const total = Object.values(weights as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    return NextResponse.json({ error: `Weights must total 100 (got ${total})` }, { status: 400 });
  }

  job.matchingWeights = weights;
  await job.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.update_matching_weights",
    resource: "jobs",
    resourceId: String(job._id),
    meta: { weights },
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
// Per-job weights are the `matchingWeightCustomization` entitlement; staff roles bypass.
export const PATCH = withAuth(withSubscription(patchHandler, { type: "toggle", feature: "matchingWeightCustomization" }));
