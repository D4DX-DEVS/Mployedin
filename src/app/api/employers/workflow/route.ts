import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import connectDB from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { workflowUpdateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { normalizeWorkflowStages, type WorkflowStageLike } from "@/lib/hiring/pipeline";
import { pickHiringRuleFields, resolveHiringRules, type HiringRulesInput } from "@/lib/hiring/workflowSettings";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; }

interface StoredWorkflow {
  stages?: unknown;
  settings?: HiringRulesInput;
}

/**
 * GET — the employer's pipeline stages (read-only in the UI) and the three
 * hiring rules, resolved through the same helper every consumer uses, so a
 * legacy document (threshold stored, no `autoRejectEnabled`) reads back as
 * auto-reject OFF exactly as the screening worker treats it.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("workflow").lean();
  const workflow = employer?.workflow as StoredWorkflow | undefined;
  const stored = workflow?.stages;
  const stages = Array.isArray(stored) && stored.length > 0
    ? normalizeWorkflowStages(stored as WorkflowStageLike[])
    : null;

  return NextResponse.json({
    stages,
    settings: resolveHiringRules(undefined, workflow?.settings),
  });
}

/**
 * PATCH — save the hiring rules. Stages are optional (the builder no longer
 * edits them); when omitted the stored list is left untouched. Rules are merged
 * over what is stored so a partial save never resets the other switches.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const { stages, settings } = await validateBody(req, workflowUpdateSchema);

  const existing = await Employer.findOne({ userId: ctx.userId }).select("workflow").lean();
  const current = (existing?.workflow as StoredWorkflow | undefined)?.settings;
  const $set: Record<string, unknown> = {
    "workflow.settings": { ...pickHiringRuleFields(current), ...pickHiringRuleFields(settings) },
  };
  if (stages) $set["workflow.stages"] = normalizeWorkflowStages(stages);

  await Employer.findOneAndUpdate({ userId: ctx.userId }, { $set }, { upsert: true });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.update_workflow",
    resource: "employers",
    resourceId: ctx.userId,
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
// Reading the pipeline stays open (the applications board renders them);
// editing them is the `workflowCustomization` entitlement.
export const PATCH = withAuth(
  withSubscription(patchHandler, { type: "toggle", feature: "workflowCustomization" }),
  { resource: "employers", action: "update" },
);
