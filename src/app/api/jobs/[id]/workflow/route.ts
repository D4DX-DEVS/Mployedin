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
import { workflowUpdateSchema } from "@/lib/validators/misc";
import { normalizeWorkflowStages, type WorkflowStageLike } from "@/lib/hiring/pipeline";
import {
  isJobWorkflowCustomized,
  pickHiringRuleFields,
  resolveHiringRulesForJob,
  type WorkflowSettingsCarrier,
} from "@/lib/hiring/workflowSettings";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

interface StoredWorkflow {
  stages?: unknown;
  settings?: Record<string, unknown>;
  customizedAt?: Date | string | null;
}

// GET /api/jobs/[id]/workflow — get per-job workflow (falls back to employer default)
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const job = await Job.findById(params!.id).select("employerId agentId workflow").lean();
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

  // Rules: saved per-job override → employer rules → defaults. A job that was
  // never customised follows the employer even if Mongoose once persisted
  // default settings on it (see src/lib/hiring/workflowSettings.ts).
  const employer = (await Employer.findById(job.employerId).select("workflow").lean()) as
    | (WorkflowSettingsCarrier & { workflow?: StoredWorkflow })
    | null;
  const customized = isJobWorkflowCustomized(job as WorkflowSettingsCarrier);
  const jobStages = (job.workflow as StoredWorkflow | undefined)?.stages;
  const stored = customized && Array.isArray(jobStages) && jobStages.length > 0
    ? jobStages
    : employer?.workflow?.stages;

  return NextResponse.json({
    stages: Array.isArray(stored) && stored.length > 0 ? normalizeWorkflowStages(stored as WorkflowStageLike[]) : null,
    settings: resolveHiringRulesForJob(job as WorkflowSettingsCarrier, employer),
    source: customized ? "job" : "employer",
  });
}

// PATCH /api/jobs/[id]/workflow — save per-job workflow
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

  const body = await validateBody(req, workflowUpdateSchema);
  const { stages, settings } = body;

  // Merge over what is stored (a rules-only save keeps the stage list) and
  // stamp customizedAt: from now on this job's rules override the employer's.
  const currentWorkflow = ((typeof job.toObject === "function" ? job.toObject().workflow : job.workflow) ?? {}) as StoredWorkflow;
  const currentStages = Array.isArray(currentWorkflow.stages) ? (currentWorkflow.stages as WorkflowStageLike[]) : [];
  job.workflow = {
    stages: stages ? normalizeWorkflowStages(stages) : currentStages,
    settings: { ...pickHiringRuleFields(currentWorkflow.settings), ...pickHiringRuleFields(settings) },
    customizedAt: new Date(),
  };
  await job.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.update_workflow",
    resource: "jobs",
    resourceId: String(job._id),
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
// Per-job pipeline overrides are the `workflowCustomization` entitlement; staff roles bypass.
export const PATCH = withAuth(withSubscription(patchHandler, { type: "toggle", feature: "workflowCustomization" }));
