import type { ApplicationStatus } from "@/models/Application";

/**
 * The hiring pipeline, in order. `Application.status` is the single source of
 * truth; workflow editors, the board, the funnel strip and the analytics route
 * all read this list instead of keeping their own copy.
 */
export const PIPELINE_STAGES = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "offer",
  "hired",
] as const satisfies readonly ApplicationStatus[];

/** Terminal statuses that sit outside the funnel. */
export const OFF_PATH_STATUSES = ["rejected", "withdrawn"] as const satisfies readonly ApplicationStatus[];

export const ALL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [...PIPELINE_STAGES, ...OFF_PATH_STATUSES];

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** i18n keys under the `hiringPipeline` namespace (messages/en.json, messages/ar.json). */
export const STAGE_LABEL_KEYS: Record<ApplicationStatus, string> = {
  applied: "applied",
  shortlisted: "shortlisted",
  interview_scheduled: "interviewing",
  selected: "selected",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

/** Stored English labels. Records must not depend on the editor's locale; display translates by id. */
export const DEFAULT_STAGE_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview_scheduled: "Interviewing",
  selected: "Selected",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Tailwind dot colour per stage, shared by the workflow editors and the board. */
export const STAGE_DOT_CLASS: Record<ApplicationStatus, string> = {
  applied: "bg-sky-500",
  shortlisted: "bg-amber-500",
  interview_scheduled: "bg-purple-500",
  selected: "bg-indigo-500",
  offer: "bg-emerald-500",
  hired: "bg-green-600",
  rejected: "bg-red-500",
  withdrawn: "bg-slate-400",
};

/**
 * Stage ids the workflow editors wrote before 2026-09-07. They never matched
 * `Application.status`, so the auto-progress rule could not follow them. Each
 * maps onto the canonical status it meant.
 */
export const LEGACY_STAGE_IDS: Record<string, ApplicationStatus> = {
  new: "applied",
  screening: "shortlisted",
  interview: "interview_scheduled",
  interview_completed: "selected",
  offer_extended: "offer",
  accepted: "hired",
};

export function isApplicationStatus(id: string): id is ApplicationStatus {
  return (ALL_APPLICATION_STATUSES as readonly string[]).includes(id);
}

/** Canonical status for a stored stage id, or null when the id is unknown. */
export function normalizeStageId(id: string): ApplicationStatus | null {
  if (isApplicationStatus(id)) return id;
  return LEGACY_STAGE_IDS[id] ?? null;
}

export interface WorkflowStageLike {
  id: string;
  label: string;
  enabled: boolean;
  autoProgress: boolean;
  order: number;
}

/**
 * Bring a stored stage list onto canonical ids: remap legacy ids, drop unknown
 * ids, merge duplicates (first by stored order wins), renumber `order` from 1.
 * When any id had to be remapped the old auto-progress flags are discarded:
 * they pointed at stages that never existed, so keeping them would advance
 * applications in a way the employer never saw work.
 */
export function normalizeWorkflowStages<T extends WorkflowStageLike>(stages: readonly T[]): T[] {
  const seen = new Set<ApplicationStatus>();
  let remapped = false;
  const out: T[] = [];
  for (const stage of [...stages].sort((a, b) => a.order - b.order)) {
    const id = normalizeStageId(stage.id);
    if (!id) continue;
    if (id !== stage.id) remapped = true;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...stage, id });
  }
  return out.map((stage, index) => ({
    ...stage,
    order: index + 1,
    autoProgress: remapped ? false : stage.autoProgress,
  }));
}

/** True when the list still carries an id that is not an application status. */
export function hasLegacyStageIds(stages: readonly WorkflowStageLike[]): boolean {
  return stages.some((s) => !isApplicationStatus(s.id));
}

/** Default pipeline for new employers/jobs: every funnel stage plus rejected, no automation. */
export const DEFAULT_WORKFLOW_STAGES: readonly WorkflowStageLike[] = [
  ...PIPELINE_STAGES.map((id, i) => ({
    id,
    label: DEFAULT_STAGE_LABELS[id],
    enabled: true,
    autoProgress: false,
    order: i + 1,
  })),
  {
    id: "rejected",
    label: DEFAULT_STAGE_LABELS.rejected,
    enabled: true,
    autoProgress: false,
    order: PIPELINE_STAGES.length + 1,
  },
];
