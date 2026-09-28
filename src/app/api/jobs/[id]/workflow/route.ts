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
import {
  buildWorkflowSnapshot,
  effectiveJobStages,
  findUsableWorkflowTemplate,
  hasWorkflowSnapshot,
  resolveWorkflowForJob,
  type JobWorkflowCarrier,
} from "@/lib/hiring/jobWorkflow";
import { decodeResolutionReason } from "@/lib/hiring/workflowTemplateMatch";
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
  template?: {
    templateId?: unknown;
    name?: string;
    version?: number;
    source?: string;
    reason?: string;
    appliedAt?: Date | string;
  } | null;
}

/** The job's workflow as the screens read it: stages + where they came from. */
function describeWorkflow(job: { workflow?: StoredWorkflow | null }) {
  const ref = job.workflow?.template;
  const carrier = job as JobWorkflowCarrier;
  return {
    stages: effectiveJobStages(carrier),
    template: hasWorkflowSnapshot(carrier) && ref
      ? {
          templateId: ref.templateId ? String(ref.templateId) : null,
          name: ref.name ?? "",
          version: ref.version ?? 1,
          source: ref.source,
          reason: decodeResolutionReason(ref.reason),
          appliedAt: ref.appliedAt ? new Date(ref.appliedAt).toISOString() : null,
        }
      : null,
  };
}

// GET /api/jobs/[id]/workflow — get per-job workflow (falls back to employer default)
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const job = await Job.findById(params!.id).select("employerId agentId workflow status").lean();
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

  return NextResponse.json({
    ...describeWorkflow(job as { workflow?: StoredWorkflow | null }),
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
  const { settings, templateId, customStages } = body;
  const currentWorkflow = ((typeof job.toObject === "function" ? job.toObject().workflow : job.workflow) ?? {}) as StoredWorkflow;
  const before = describeWorkflow({ workflow: currentWorkflow });
  const next: StoredWorkflow = { ...currentWorkflow };

  // Stage list: a template someone picked, back to automatic matching (null),
  // or stages edited for this job. Candidates keep their status; one whose
  // stage the new list lacks sits in the first stage of that status.
  if (customStages) {
    const current = before.template;
    const snapshot = buildWorkflowSnapshot(null, "custom", undefined, customStages);
    next.stages = snapshot.stages;
    next.template = {
      ...snapshot.template,
      templateId: current?.templateId ?? null,
      name: current?.name ?? "",
      version: current?.version ?? 1,
    };
  } else if (templateId) {
    const template = await findUsableWorkflowTemplate(templateId, job.employerId);
    if (!template) return NextResponse.json({ error: "Workflow template not found" }, { status: 404 });
    Object.assign(next, buildWorkflowSnapshot(template, "manual"));
  } else if (templateId === null) {
    const resolved = await resolveWorkflowForJob(job as unknown as JobWorkflowCarrier);
    Object.assign(next, buildWorkflowSnapshot(resolved.template, "auto", resolved.reason, resolved.stages));
  }

  // Rules: merged over what is stored, and customizedAt stamped — from now on
  // this job's rules override the employer's. A stage-only save leaves both.
  if (settings) {
    next.settings = { ...pickHiringRuleFields(currentWorkflow.settings), ...pickHiringRuleFields(settings) };
    next.customizedAt = new Date();
  }
  job.workflow = next as typeof job.workflow;
  await job.save();

  const after = describeWorkflow({ workflow: next });
  const stagesChanged = customStages !== undefined || templateId !== undefined;
  await logActivity({
    ...actorFromCtx(ctx),
    action: stagesChanged ? "job.workflow_change" : "job.update_workflow",
    resource: "jobs",
    resourceId: String(job._id),
    ...(stagesChanged
      ? {
          changes: {
            before: { workflow: before.template?.name || "Standard pipeline", source: before.template?.source ?? null },
            after: { workflow: after.template?.name || "Standard pipeline", source: after.template?.source ?? null },
          },
        }
      : {}),
    req,
  });

  return NextResponse.json({ success: true, ...after });
}

export const GET = withAuth(getHandler);
// Per-job pipeline overrides are the `workflowCustomization` entitlement; staff roles bypass.
export const PATCH = withAuth(withSubscription(patchHandler, { type: "toggle", feature: "workflowCustomization" }));
