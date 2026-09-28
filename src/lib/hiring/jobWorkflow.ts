import mongoose from "mongoose";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import Employer from "@/models/Employer";
import logger from "@/lib/logger";
import {
  DEFAULT_WORKFLOW_STAGE_DEFS,
  normalizeWorkflowStageDefs,
  type WorkflowStageDef,
} from "./workflowStages";
import {
  encodeResolutionReason,
  pickWorkflowTemplate,
  type MatchableJob,
  type MatchableTemplate,
  type WorkflowResolutionReason,
} from "./workflowTemplateMatch";

/**
 * A job's hiring workflow: which template it runs on and the stages it was
 * given. The stages are a SNAPSHOT — editing the template later never touches
 * a live job, so an application's stage history keeps meaning what it meant.
 *
 * While a job is a draft and nobody has picked a workflow for it, the pick
 * follows the job's details (category, type, title…) on every save. From
 * publication on the snapshot is frozen; only an explicit change moves it.
 */

export type JobWorkflowSource = "auto" | "manual" | "custom";

export interface JobWorkflowTemplateRef {
  templateId: mongoose.Types.ObjectId | null;
  name: string;
  version: number;
  source: JobWorkflowSource;
  reason?: string;
  appliedAt: Date;
}

export interface LeanWorkflowTemplate extends MatchableTemplate {
  _id: mongoose.Types.ObjectId;
  employerId?: mongoose.Types.ObjectId | null;
  stages?: unknown;
  version?: number | null;
}

/** The slice of a Job these helpers read. */
export interface JobWorkflowCarrier extends MatchableJob {
  employerId?: unknown;
  status?: string;
  workflow?: {
    stages?: unknown;
    template?: Partial<JobWorkflowTemplateRef> | null;
  } | null;
}

const TEMPLATE_FIELDS = "name scope employerId stages isDefault isActive priority match version updatedAt";

/** A template counts for an employer when it is the platform's or their own. */
function visibleToEmployer(employerId: unknown): Record<string, unknown> {
  const own = employerId && mongoose.isValidObjectId(String(employerId))
    ? [{ scope: "employer", employerId: new mongoose.Types.ObjectId(String(employerId)) }]
    : [];
  return { $or: [{ scope: "system" }, ...own] };
}

/** Active templates a job of this employer can run on (the platform's plus the employer's own). */
export async function loadWorkflowTemplatesFor(employerId: unknown): Promise<LeanWorkflowTemplate[]> {
  return WorkflowTemplate.find({ ...visibleToEmployer(employerId), isActive: { $ne: false } })
    .select(TEMPLATE_FIELDS)
    .lean<LeanWorkflowTemplate[]>();
}

/** One template the employer may put a job on, or null (unknown, archived, or another employer's). */
export async function findUsableWorkflowTemplate(templateId: string, employerId: unknown): Promise<LeanWorkflowTemplate | null> {
  if (!mongoose.isValidObjectId(templateId)) return null;
  return WorkflowTemplate.findOne({ _id: templateId, ...visibleToEmployer(employerId), isActive: { $ne: false } })
    .select(TEMPLATE_FIELDS)
    .lean<LeanWorkflowTemplate | null>();
}

export async function employerDefaultTemplateId(employerId: unknown): Promise<string | null> {
  if (!employerId || !mongoose.isValidObjectId(String(employerId))) return null;
  const employer = await Employer.findById(employerId).select("workflow").lean<{ workflow?: { defaultTemplateId?: unknown } } | null>();
  const id = employer?.workflow?.defaultTemplateId;
  return id ? String(id) : null;
}

export interface ResolvedWorkflow {
  template: LeanWorkflowTemplate | null;
  reason: WorkflowResolutionReason;
  stages: WorkflowStageDef[];
}

/** The workflow a job with these details would get automatically. */
export async function resolveWorkflowForJob(job: MatchableJob & { employerId?: unknown }): Promise<ResolvedWorkflow> {
  const [templates, defaultId] = await Promise.all([
    loadWorkflowTemplatesFor(job.employerId),
    employerDefaultTemplateId(job.employerId),
  ]);
  const { template, reason } = pickWorkflowTemplate(templates, job, { employerDefaultTemplateId: defaultId });
  return { template, reason, stages: template ? normalizeWorkflowStageDefs(template.stages) : DEFAULT_WORKFLOW_STAGE_DEFS.map((s) => ({ ...s })) };
}

export interface WorkflowSnapshot {
  stages: WorkflowStageDef[];
  template: JobWorkflowTemplateRef;
}

export function buildWorkflowSnapshot(
  template: LeanWorkflowTemplate | null,
  source: JobWorkflowSource,
  reason?: WorkflowResolutionReason,
  stages?: WorkflowStageDef[],
): WorkflowSnapshot {
  return {
    stages: stages ?? (template ? normalizeWorkflowStageDefs(template.stages) : DEFAULT_WORKFLOW_STAGE_DEFS.map((s) => ({ ...s }))),
    template: {
      templateId: template?._id ?? null,
      name: template?.name ?? "",
      version: template?.version ?? 1,
      source,
      ...(reason ? { reason: encodeResolutionReason(reason) } : {}),
      appliedAt: new Date(),
    },
  };
}

/** True once a workflow snapshot has been written onto the job. */
export function hasWorkflowSnapshot(job: JobWorkflowCarrier | null | undefined): boolean {
  const source = job?.workflow?.template?.source;
  return source === "auto" || source === "manual" || source === "custom";
}

/**
 * The stages a job runs: its snapshot, or the standard pipeline for a job
 * posted before workflow templates took effect.
 */
export function effectiveJobStages(job: JobWorkflowCarrier | null | undefined): WorkflowStageDef[] {
  if (!hasWorkflowSnapshot(job)) return DEFAULT_WORKFLOW_STAGE_DEFS.map((s) => ({ ...s }));
  return normalizeWorkflowStageDefs(job?.workflow?.stages);
}

/** Minimal mutable job surface the save hook works with (a hydrated Job document). */
export interface WorkflowHookJob extends JobWorkflowCarrier {
  isNew: boolean;
  isModified(path: string): boolean;
  set(path: string, value: unknown): unknown;
  $locals?: Record<string, unknown>;
}

const MATCH_FIELDS = ["title", "category", "employmentType", "workMode", "requirements", "status", "employerId"];

/**
 * Pre-save: give the job its workflow. A person's explicit pick (passed through
 * `job.$locals.workflowTemplateId`, or already stored as manual/custom) sticks;
 * otherwise a new job or a draft is matched from its details. A live job is
 * never re-matched. `job.$locals.rematchWorkflow` puts a draft whose pick was
 * cleared back on automatic matching. Never throws — a template lookup failure leaves the job on
 * whatever it had (or the standard pipeline) instead of failing the save.
 */
export async function applyJobWorkflowOnSave(job: WorkflowHookJob): Promise<void> {
  try {
    const requested = job.$locals?.workflowTemplateId;
    if (typeof requested === "string" && requested) {
      const template = await findUsableWorkflowTemplate(requested, job.employerId);
      if (template) {
        const snapshot = buildWorkflowSnapshot(template, "manual");
        job.set("workflow.stages", snapshot.stages);
        job.set("workflow.template", snapshot.template);
        return;
      }
      logger.warn({ templateId: requested, employerId: String(job.employerId ?? "") }, "[workflow] requested template is not usable; matching instead");
    }

    const rematch = job.$locals?.rematchWorkflow === true;
    const source = job.workflow?.template?.source;
    if (!rematch && (source === "manual" || source === "custom")) return;

    // `initialStatus` is stamped when the document is loaded (post-init hook
    // on the Job schema). Only a new job or one loaded as a draft is matched —
    // including the save that publishes it. A live job keeps its snapshot, and
    // one posted before templates existed keeps the standard pipeline.
    const wasDraft = job.isNew || job.$locals?.initialStatus === "draft";
    if (!wasDraft) return;
    // Re-match a draft only when something the rules read has changed.
    if (!rematch && !job.isNew && hasWorkflowSnapshot(job) && !MATCH_FIELDS.some((f) => job.isModified(f))) return;

    const resolved = await resolveWorkflowForJob(job);
    const snapshot = buildWorkflowSnapshot(resolved.template, "auto", resolved.reason, resolved.stages);
    job.set("workflow.stages", snapshot.stages);
    job.set("workflow.template", snapshot.template);
  } catch (err) {
    logger.error({ err, jobId: String((job as { _id?: unknown })._id ?? "") }, "[workflow] could not resolve the job's workflow");
  }
}
