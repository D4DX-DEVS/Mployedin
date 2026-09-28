/**
 * Which workflow template a job runs on — decided from the job itself.
 *
 * Order: a template the poster picked → the best template whose rules match
 * the job (category, employment type, work mode, title words, seniority) →
 * the employer's default → the platform default → the standard pipeline.
 * Pure: callers load the templates, this ranks them.
 */

export const MATCH_DIMENSIONS = ["category", "employmentType", "workMode", "title", "experience"] as const;
export type MatchDimension = (typeof MATCH_DIMENSIONS)[number];

export interface WorkflowTemplateMatchRules {
  categories?: string[] | null;
  employmentTypes?: string[] | null;
  workModes?: string[] | null;
  titleKeywords?: string[] | null;
  /** The job asks for at least this many years (its `requirements.experienceMin`). */
  minExperienceYears?: number | null;
}

export interface MatchableJob {
  title?: string | null;
  category?: string | null;
  employmentType?: string | null;
  workMode?: string | null;
  requirements?: { experienceMin?: number | null } | null;
}

export interface MatchableTemplate {
  _id: unknown;
  name: string;
  scope: "system" | "employer";
  isDefault?: boolean | null;
  isActive?: boolean | null;
  priority?: number | null;
  match?: WorkflowTemplateMatchRules | null;
  updatedAt?: Date | string | null;
}

export type WorkflowResolutionReason =
  | { kind: "matched"; dimensions: MatchDimension[] }
  | { kind: "employer_default" }
  | { kind: "platform_default" }
  | { kind: "standard" };

const norm = (value: string): string => value.trim().toLowerCase();

function nonEmpty(values: readonly string[] | null | undefined): string[] {
  return (values ?? []).map(norm).filter(Boolean);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `keyword` appears in `title` as whole word(s). */
export function titleHasKeyword(title: string, keyword: string): boolean {
  const k = norm(keyword);
  if (!k) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(k)}($|[^\\p{L}\\p{N}])`, "iu").test(title);
}

export function hasMatchRules(rules: WorkflowTemplateMatchRules | null | undefined): boolean {
  if (!rules) return false;
  return (
    nonEmpty(rules.categories).length > 0 ||
    nonEmpty(rules.employmentTypes).length > 0 ||
    nonEmpty(rules.workModes).length > 0 ||
    nonEmpty(rules.titleKeywords).length > 0 ||
    (typeof rules.minExperienceYears === "number" && rules.minExperienceYears > 0)
  );
}

/**
 * The rule dimensions a job satisfies, or null when any stated rule fails.
 * Every stated dimension must hold (AND); inside one, any value will do (OR).
 * A template with no rules never matches — it is only ever a default or a pick.
 */
export function matchDimensions(rules: WorkflowTemplateMatchRules | null | undefined, job: MatchableJob): MatchDimension[] | null {
  if (!hasMatchRules(rules)) return null;
  const r = rules as WorkflowTemplateMatchRules;
  const matched: MatchDimension[] = [];

  const categories = nonEmpty(r.categories);
  if (categories.length > 0) {
    if (!job.category || !categories.includes(norm(job.category))) return null;
    matched.push("category");
  }
  const types = nonEmpty(r.employmentTypes);
  if (types.length > 0) {
    if (!job.employmentType || !types.includes(norm(job.employmentType))) return null;
    matched.push("employmentType");
  }
  const modes = nonEmpty(r.workModes);
  if (modes.length > 0) {
    if (!job.workMode || !modes.includes(norm(job.workMode))) return null;
    matched.push("workMode");
  }
  const keywords = nonEmpty(r.titleKeywords);
  if (keywords.length > 0) {
    const title = job.title ?? "";
    if (!keywords.some((k) => titleHasKeyword(title, k))) return null;
    matched.push("title");
  }
  if (typeof r.minExperienceYears === "number" && r.minExperienceYears > 0) {
    const min = job.requirements?.experienceMin;
    if (typeof min !== "number" || min < r.minExperienceYears) return null;
    matched.push("experience");
  }
  return matched;
}

const isActive = (t: MatchableTemplate): boolean => t.isActive !== false;
const time = (value: Date | string | null | undefined): number => (value ? new Date(value).getTime() || 0 : 0);

export interface WorkflowPick<T extends MatchableTemplate> {
  template: T | null;
  reason: WorkflowResolutionReason;
}

/**
 * Rank the templates for a job. Among matches: the employer's own templates
 * before platform ones, then higher priority, then the more specific rule set,
 * then the most recently edited.
 */
export function pickWorkflowTemplate<T extends MatchableTemplate>(
  templates: readonly T[],
  job: MatchableJob,
  options: { employerDefaultTemplateId?: string | null } = {},
): WorkflowPick<T> {
  const active = templates.filter(isActive);

  const matches = active
    .map((template) => ({ template, dimensions: matchDimensions(template.match, job) }))
    .filter((m): m is { template: T; dimensions: MatchDimension[] } => m.dimensions !== null)
    .sort(
      (a, b) =>
        Number(b.template.scope === "employer") - Number(a.template.scope === "employer") ||
        (b.template.priority ?? 0) - (a.template.priority ?? 0) ||
        b.dimensions.length - a.dimensions.length ||
        time(b.template.updatedAt) - time(a.template.updatedAt),
    );
  if (matches.length > 0) {
    return { template: matches[0].template, reason: { kind: "matched", dimensions: matches[0].dimensions } };
  }

  const employerDefault =
    (options.employerDefaultTemplateId
      ? active.find((t) => String(t._id) === String(options.employerDefaultTemplateId))
      : undefined) ?? active.find((t) => t.scope === "employer" && t.isDefault);
  if (employerDefault) return { template: employerDefault, reason: { kind: "employer_default" } };

  const platformDefault = active.find((t) => t.scope === "system" && t.isDefault);
  if (platformDefault) return { template: platformDefault, reason: { kind: "platform_default" } };

  return { template: null, reason: { kind: "standard" } };
}

/** Compact, storable form of a reason ("matched:category,title"). */
export function encodeResolutionReason(reason: WorkflowResolutionReason): string {
  return reason.kind === "matched" ? `matched:${reason.dimensions.join(",")}` : reason.kind;
}

export function decodeResolutionReason(value: string | null | undefined): WorkflowResolutionReason | null {
  if (!value) return null;
  if (value.startsWith("matched:")) {
    const dimensions = value
      .slice("matched:".length)
      .split(",")
      .filter((d): d is MatchDimension => (MATCH_DIMENSIONS as readonly string[]).includes(d));
    return { kind: "matched", dimensions };
  }
  if (value === "employer_default" || value === "platform_default" || value === "standard") return { kind: value };
  return null;
}
