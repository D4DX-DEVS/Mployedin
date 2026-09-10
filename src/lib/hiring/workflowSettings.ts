/**
 * Hiring rules — the only reader of `workflow.settings`.
 *
 * Employers store three rules (auto-reject, candidate notifications,
 * shortlist target) on `Employer.workflow.settings` and may override them per
 * job on `Job.workflow.settings`. Every consumer — the screening worker, the
 * application routes, the workflow APIs and the copilot — resolves them
 * through this module so the precedence and the defaults live in one place.
 *
 * Auto-reject is opt-in: documents written before 2026-09-10 carry
 * `{ aiAutoScreen: true, autoRejectBelow: 40 }` and no `autoRejectEnabled`
 * flag, so they resolve to OFF without a data migration. `aiAutoScreen` is
 * retired — scoring always runs — and is ignored here.
 *
 * Per-job overrides count only once `workflow.customizedAt` is set, which
 * only PATCH /api/jobs/[id]/workflow does. Mongoose used to persist default
 * settings on every job, so "job value present" could not distinguish a saved
 * override from a default that would silently beat the employer's rule.
 */

export interface HiringRules {
  /** Reject on arrival when the match score is below `autoRejectBelow`. */
  autoRejectEnabled: boolean;
  /** 0–100. Only meaningful when `autoRejectEnabled`. */
  autoRejectBelow: number;
  /** Email/in-app updates to candidates when their stage changes. */
  notifyOnStageChange: boolean;
  /** Default N for "shortlist the best N" (copilot + page dialog). */
  shortlistTarget: number;
}

export const SHORTLIST_TARGET_MIN = 5;
export const SHORTLIST_TARGET_MAX = 100;

/** Match score at or above which a new applicant is worth telling the employer about. */
export const STRONG_MATCH_THRESHOLD = 80;

export const HIRING_RULE_DEFAULTS: Readonly<HiringRules> = Object.freeze({
  autoRejectEnabled: false,
  autoRejectBelow: 40,
  notifyOnStageChange: true,
  shortlistTarget: 50,
});

/** Whatever shape a stored `workflow.settings` blob happens to have. */
export type HiringRulesInput = Record<string, unknown> | null | undefined;

/** The slice of a Job or Employer document these helpers read. */
export interface WorkflowSettingsCarrier {
  workflow?: {
    settings?: HiringRulesInput;
    /** Jobs only: set by the per-job save; absent = "use the employer's rules". */
    customizedAt?: Date | string | null;
  } | null;
}

function pickBoolean(sources: HiringRulesInput[], key: keyof HiringRules, fallback: boolean): boolean {
  for (const source of sources) {
    const value = source && typeof source === "object" ? (source as Record<string, unknown>)[key] : undefined;
    if (typeof value === "boolean") return value;
  }
  return fallback;
}

function pickNumber(
  sources: HiringRulesInput[],
  key: keyof HiringRules,
  fallback: number,
  min: number,
  max: number,
): number {
  for (const source of sources) {
    const value = source && typeof source === "object" ? (source as Record<string, unknown>)[key] : undefined;
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.min(max, Math.max(min, Math.round(value)));
    }
  }
  return fallback;
}

/**
 * Resolve rules from two raw settings blobs.
 *
 * Precedence per field: first blob → second blob → default. A field of the
 * wrong type is skipped as if unset; numbers are clamped into range.
 */
export function resolveHiringRules(jobSettings?: HiringRulesInput, employerSettings?: HiringRulesInput): HiringRules {
  const sources: HiringRulesInput[] = [jobSettings, employerSettings];
  return {
    autoRejectEnabled: pickBoolean(sources, "autoRejectEnabled", HIRING_RULE_DEFAULTS.autoRejectEnabled),
    autoRejectBelow: pickNumber(sources, "autoRejectBelow", HIRING_RULE_DEFAULTS.autoRejectBelow, 0, 100),
    notifyOnStageChange: pickBoolean(sources, "notifyOnStageChange", HIRING_RULE_DEFAULTS.notifyOnStageChange),
    shortlistTarget: pickNumber(
      sources,
      "shortlistTarget",
      HIRING_RULE_DEFAULTS.shortlistTarget,
      SHORTLIST_TARGET_MIN,
      SHORTLIST_TARGET_MAX,
    ),
  };
}

/** True once the employer has saved rules for this specific job. */
export function isJobWorkflowCustomized(job: WorkflowSettingsCarrier | null | undefined): boolean {
  return Boolean(job?.workflow?.customizedAt);
}

/** The job's own settings — but only when they were saved on purpose. */
export function jobRuleOverrides(job: WorkflowSettingsCarrier | null | undefined): HiringRulesInput {
  return isJobWorkflowCustomized(job) ? job?.workflow?.settings : undefined;
}

/** The effective rules for one job: saved job override → employer rules → defaults. */
export function resolveHiringRulesForJob(
  job: WorkflowSettingsCarrier | null | undefined,
  employer: WorkflowSettingsCarrier | null | undefined,
): HiringRules {
  return resolveHiringRules(jobRuleOverrides(job), employer?.workflow?.settings);
}

/** True when the rules say this score should be rejected on arrival. */
export function shouldAutoReject(rules: HiringRules, score: number | null | undefined): boolean {
  return rules.autoRejectEnabled && typeof score === "number" && score < rules.autoRejectBelow;
}

/**
 * Keep only the four rule fields (with the right types) from a raw blob —
 * what the workflow routes persist, so retired keys such as `aiAutoScreen`
 * stop being written back.
 */
export function pickHiringRuleFields(input: HiringRulesInput): Partial<HiringRules> {
  const out: Partial<HiringRules> = {};
  if (!input || typeof input !== "object") return out;
  const raw = input as Record<string, unknown>;
  if (typeof raw.autoRejectEnabled === "boolean") out.autoRejectEnabled = raw.autoRejectEnabled;
  if (typeof raw.notifyOnStageChange === "boolean") out.notifyOnStageChange = raw.notifyOnStageChange;
  if (typeof raw.autoRejectBelow === "number" && Number.isFinite(raw.autoRejectBelow)) out.autoRejectBelow = raw.autoRejectBelow;
  if (typeof raw.shortlistTarget === "number" && Number.isFinite(raw.shortlistTarget)) out.shortlistTarget = raw.shortlistTarget;
  return out;
}
