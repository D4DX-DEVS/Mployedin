import {
  DEFAULT_STAGE_LABELS,
  LEGACY_STAGE_IDS,
  PIPELINE_STAGES,
  isPipelineStage,
  type PipelineStage,
} from "./pipeline";

/**
 * Workflow stages — the named steps a job's candidates move through.
 *
 * `Application.status` stays the fixed six-step backbone (interviews, offers,
 * placements and commissions all key off it). A workflow names the steps an
 * employer actually runs and hangs each one on a status, its `phase`:
 *
 *   Applied → Coding Test → Technical Interview → Culture Fit → Offer → Hired
 *   applied   shortlisted   interview_scheduled   interview_…   offer   hired
 *
 * Several stages may share a phase. An application records the stage it sits
 * in (`Application.stageId`); an application whose stage is unknown to the
 * job's workflow — never set, or left over from another phase — belongs to
 * the first stage of its status. Rejected and withdrawn are outcomes, never
 * stages.
 */
export interface WorkflowStageDef {
  /** Stable slug, unique within one workflow. Canonical stages use the status id. */
  id: string;
  label: string;
  phase: PipelineStage;
  order: number;
}

export const MAX_WORKFLOW_STAGES = 20;
export const STAGE_ID_PATTERN = /^[a-z0-9][a-z0-9_]{0,39}$/;
export const STAGE_LABEL_MAX = 60;

/** The standard pipeline: one stage per status, named after it. */
export const DEFAULT_WORKFLOW_STAGE_DEFS: readonly WorkflowStageDef[] = Object.freeze(
  PIPELINE_STAGES.map((phase, i) => Object.freeze({ id: phase, label: DEFAULT_STAGE_LABELS[phase], phase, order: i + 1 })),
);

export function phaseIndex(phase: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(phase);
}

/** A canonical stage still carrying its stock English name — display translates it by id. */
export function isStockStage(stage: Pick<WorkflowStageDef, "id" | "label" | "phase">): boolean {
  return stage.id === stage.phase && stage.label === DEFAULT_STAGE_LABELS[stage.phase];
}

export function slugifyStageId(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return STAGE_ID_PATTERN.test(slug) ? slug : "";
}

type Outcome = "outcome";

/**
 * Where a stage written before phases existed belongs. Stage ids from the old
 * editor and the seeded templates are free text ("coding_test",
 * "panel_interview_1"); the words in them say which status they run under.
 * Anything unrecognised continues the stage before it.
 */
function inferPhase(id: string, label: string, previous: PipelineStage | null): PipelineStage | Outcome {
  const text = `${id} ${label}`.toLowerCase().replace(/_/g, " ");
  if (/\b(reject|rejected|declined?|withdrawn?)\b/.test(text)) return "outcome";
  if (/\b(hired?|accepted|onboard(ing)?|joined)\b/.test(text)) return "hired";
  if (/\boffer/.test(text)) return "offer";
  if (/interview|\bpanel\b|\bround\b|in person|\blive\b/.test(text)) return "interview_scheduled";
  const afterInterview = previous !== null && phaseIndex(previous) >= phaseIndex("interview_scheduled");
  if (afterInterview && /check|verif|clearance|review|reference|final|select|approv|decision/.test(text)) return "selected";
  if (/shortlist|screen/.test(text)) return "shortlisted";
  return previous ?? "applied";
}

function phaseOf(raw: Record<string, unknown>, previous: PipelineStage | null): PipelineStage | Outcome | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  const label = typeof raw.label === "string" ? raw.label : "";
  if (typeof raw.phase === "string") {
    if (isPipelineStage(raw.phase)) return raw.phase;
    if (raw.phase === "rejected" || raw.phase === "withdrawn") return "outcome";
  }
  if (isPipelineStage(id)) return id;
  if (id === "rejected" || id === "withdrawn") return "outcome";
  const legacy = LEGACY_STAGE_IDS[id];
  if (legacy) return isPipelineStage(legacy) ? legacy : "outcome";
  if (!id && !label) return null;
  return inferPhase(id, label, previous);
}

/**
 * Bring any stored stage list — new, legacy or hand-edited — into a valid
 * workflow: disabled and outcome stages dropped, phases never going backwards,
 * ids unique, the first stage an Applied one and a Hired stage present.
 */
export function normalizeWorkflowStageDefs(raw: unknown): WorkflowStageDef[] {
  if (!Array.isArray(raw)) return DEFAULT_WORKFLOW_STAGE_DEFS.map((s) => ({ ...s }));

  const rows = raw
    .map((value, index) => ({ value, index }))
    .filter((r): r is { value: Record<string, unknown>; index: number } => Boolean(r.value) && typeof r.value === "object")
    .filter((r) => r.value.enabled !== false)
    .sort((a, b) => {
      const ao = typeof a.value.order === "number" ? a.value.order : a.index;
      const bo = typeof b.value.order === "number" ? b.value.order : b.index;
      return ao - bo || a.index - b.index;
    });

  const out: WorkflowStageDef[] = [];
  const seen = new Set<string>();
  let previous: PipelineStage | null = null;
  for (const { value } of rows) {
    const inferred = phaseOf(value, previous);
    if (!inferred || inferred === "outcome") continue;
    // Phases only move forward: a stage filed before the one above it runs
    // under the earlier stage's status instead.
    const phase: PipelineStage = previous && phaseIndex(inferred) < phaseIndex(previous) ? previous : inferred;
    const rawLabel = typeof value.label === "string" ? value.label.trim().slice(0, STAGE_LABEL_MAX) : "";
    const label = rawLabel || DEFAULT_STAGE_LABELS[phase];
    const rawId = typeof value.id === "string" ? value.id : "";
    const id = (STAGE_ID_PATTERN.test(rawId) ? rawId : slugifyStageId(rawId) || slugifyStageId(label)) || phase;
    let unique = id;
    for (let n = 2; seen.has(unique); n++) unique = `${id.slice(0, 36)}_${n}`;
    seen.add(unique);
    out.push({ id: unique, label, phase, order: 0 });
    previous = phase;
  }

  if (!out.some((s) => s.phase === "applied")) {
    const id = seen.has("applied") ? "applied_stage" : "applied";
    out.unshift({ id, label: DEFAULT_STAGE_LABELS.applied, phase: "applied", order: 0 });
  }
  if (!out.some((s) => s.phase === "hired")) {
    const id = seen.has("hired") ? "hired_stage" : "hired";
    out.push({ id, label: DEFAULT_STAGE_LABELS.hired, phase: "hired", order: 0 });
  }
  return out.slice(0, MAX_WORKFLOW_STAGES).map((stage, i) => ({ ...stage, order: i + 1 }));
}

/** Why a stage list cannot be saved as-is; empty when it can. */
export type StageListProblem =
  | "too_few"
  | "too_many"
  | "first_not_applied"
  | "no_hired"
  | "phase_backwards"
  | "duplicate_id"
  | "bad_id"
  | "empty_label";

export function validateWorkflowStageDefs(stages: readonly Pick<WorkflowStageDef, "id" | "label" | "phase">[]): StageListProblem[] {
  const problems = new Set<StageListProblem>();
  if (stages.length < 2) problems.add("too_few");
  if (stages.length > MAX_WORKFLOW_STAGES) problems.add("too_many");
  if (stages.length > 0 && stages[0].phase !== "applied") problems.add("first_not_applied");
  if (!stages.some((s) => s.phase === "hired")) problems.add("no_hired");
  const ids = new Set<string>();
  stages.forEach((stage, i) => {
    if (!STAGE_ID_PATTERN.test(stage.id)) problems.add("bad_id");
    if (ids.has(stage.id)) problems.add("duplicate_id");
    ids.add(stage.id);
    if (!stage.label.trim()) problems.add("empty_label");
    if (i > 0 && phaseIndex(stage.phase) < phaseIndex(stages[i - 1].phase)) problems.add("phase_backwards");
  });
  return [...problems];
}

/** The workflow's stages that run under one status, in order. */
export function stagesInPhase(stages: readonly WorkflowStageDef[], phase: string): WorkflowStageDef[] {
  return stages.filter((s) => s.phase === phase);
}

/**
 * The stage an application sits in: its recorded stage when that stage runs
 * under the application's status, otherwise the first stage of that status.
 * Null when the workflow has no stage for the status (off-path, or a status
 * the workflow skips).
 */
export function stageForApplication(
  stages: readonly WorkflowStageDef[],
  status: string,
  stageId?: string | null,
): WorkflowStageDef | null {
  const inPhase = stagesInPhase(stages, status);
  if (inPhase.length === 0) return null;
  return inPhase.find((s) => s.id === stageId) ?? inPhase[0];
}

/** One board column: a stage, or a whole status the workflow does not name. */
export interface WorkflowColumn {
  key: string;
  phase: PipelineStage;
  /** Set when the column is one of several stages sharing a status; null = every application of the status. */
  stageId: string | null;
  stage: WorkflowStageDef | null;
}

/**
 * Board columns for a workflow. Each stage is a column; a status the workflow
 * skips still gets a column while candidates sit in it (an interview or offer
 * created elsewhere moves them there), so nobody disappears from the board.
 */
export function workflowColumns(
  stages: readonly WorkflowStageDef[],
  statusCounts: Readonly<Record<string, number>> = {},
): WorkflowColumn[] {
  const columns: WorkflowColumn[] = [];
  for (const phase of PIPELINE_STAGES) {
    const inPhase = stagesInPhase(stages, phase);
    if (inPhase.length === 0) {
      if ((statusCounts[phase] ?? 0) > 0) columns.push({ key: `phase:${phase}`, phase, stageId: null, stage: null });
      continue;
    }
    for (const stage of inPhase) {
      columns.push({ key: `stage:${stage.id}`, phase, stageId: inPhase.length > 1 ? stage.id : null, stage });
    }
  }
  return columns;
}

/**
 * Extra Mongo filter narrowing a status to one of its stages. `{}` when the
 * status has a single stage (every application of it belongs there); `null`
 * when the stage is not part of this status (the caller answers with nothing).
 */
export function stageQueryFilter(
  stages: readonly WorkflowStageDef[],
  status: string,
  stageId: string,
): Record<string, unknown> | null {
  const inPhase = stagesInPhase(stages, status);
  if (inPhase.length < 2) return inPhase.some((s) => s.id === stageId) ? {} : null;
  const index = inPhase.findIndex((s) => s.id === stageId);
  if (index < 0) return null;
  if (index === 0) return { stageId: { $nin: inPhase.slice(1).map((s) => s.id) } };
  return { stageId };
}

/** Per-column totals from `{ status, stageId, count }` rows. */
export function columnCounts(
  stages: readonly WorkflowStageDef[],
  rows: readonly { status: string; stageId?: string | null; count: number }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const stage = stageForApplication(stages, row.status, row.stageId);
    const key = stage ? `stage:${stage.id}` : `phase:${row.status}`;
    counts[key] = (counts[key] ?? 0) + row.count;
  }
  return counts;
}

/** The stage after `current` in workflow order, or null at the end. */
export function nextWorkflowStage(stages: readonly WorkflowStageDef[], current: WorkflowStageDef | null): WorkflowStageDef | null {
  if (!current) return stages[0] ?? null;
  const index = stages.findIndex((s) => s.id === current.id);
  return index > -1 ? stages[index + 1] ?? null : null;
}
