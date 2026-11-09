import { splitJobDescription } from "@/lib/jobs/descriptionSections";

/** A job as the AI drafts it (poster reader or job creator chat) — loosely typed. */
export interface ExtractedRequirements {
  skills?: string[];
  preferredSkills?: string[];
  experienceMin?: number;
  experienceMax?: number;
  education?: string;
}

export interface ExtractedSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: "monthly" | "yearly" | "lpa";
  isNegotiable?: boolean;
}

/** A screening question as the model writes it — loosely typed, normalised by buildPrefill. */
export interface ExtractedScreeningQuestion {
  label?: string;
  /** Some replies use `question` instead of `label`. */
  question?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface ExtractedJob {
  title?: string;
  category?: string;
  location?: string | { country?: string; city?: string; isRemote?: boolean };
  description?: string;
  requirements?: string[] | ExtractedRequirements;
  salary?: ExtractedSalary;
  employmentType?: string;
  workMode?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  vacancies?: number;
  showSalary?: boolean;
  tags?: string[];
  visibility?: string;
  screeningQuestions?: ExtractedScreeningQuestion[];
}

export function extractSkills(requirements?: ExtractedJob["requirements"]): string[] {
  if (Array.isArray(requirements)) {
    return requirements.filter(Boolean).slice(0, 12);
  }

  return requirements?.skills?.filter(Boolean).slice(0, 12) ?? [];
}

/** The requirements object of a draft (older replies sent a bare skills array). */
export function requirementsOf(job: ExtractedJob): ExtractedRequirements {
  return Array.isArray(job.requirements) ? { skills: job.requirements } : (job.requirements ?? {});
}

/**
 * The draft's experience range. A poster's "5+ years" comes back as min 5 and
 * max 0 (or no max): that is a minimum with no upper limit, not a range the
 * jobs API would accept (max must be >= min). 0 / 0 means none was given.
 */
export function experienceRange(job: ExtractedJob): { min?: number; max?: number } {
  const { experienceMin, experienceMax } = requirementsOf(job);
  const min = typeof experienceMin === "number" && experienceMin >= 0 ? experienceMin : undefined;
  const max = typeof experienceMax === "number" && experienceMax >= (min ?? 0) && !(experienceMax === 0 && (min ?? 0) > 0)
    ? experienceMax
    : undefined;
  if ((min ?? 0) === 0 && (max ?? 0) === 0) return {};
  return { min, max };
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const strs = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const withoutUndefined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/**
 * A draft as the AI wrote it, with every field of the wrong type dropped, so a
 * stray string-for-a-list can't crash the preview (and, once saved in
 * sessionStorage, crash it again on every reload). Fields left out stay out,
 * so merging it never blanks a field.
 */
export function normalizeDraft(raw: unknown): ExtractedJob {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const loc = r.location;
  const req = r.requirements;
  const sal = r.salary && typeof r.salary === "object" ? (r.salary as Record<string, unknown>) : undefined;
  const period = str(sal?.period);
  return withoutUndefined<ExtractedJob>({
    title: str(r.title),
    category: str(r.category),
    description: str(r.description),
    location: typeof loc === "string"
      ? loc
      : loc && typeof loc === "object"
        ? withoutUndefined({
            country: str((loc as Record<string, unknown>).country),
            city: str((loc as Record<string, unknown>).city),
            isRemote: typeof (loc as Record<string, unknown>).isRemote === "boolean" ? ((loc as Record<string, unknown>).isRemote as boolean) : undefined,
          })
        : undefined,
    requirements: Array.isArray(req)
      ? strs(req)
      : req && typeof req === "object"
        ? withoutUndefined<ExtractedRequirements>({
            skills: strs((req as Record<string, unknown>).skills),
            preferredSkills: strs((req as Record<string, unknown>).preferredSkills),
            experienceMin: num((req as Record<string, unknown>).experienceMin),
            experienceMax: num((req as Record<string, unknown>).experienceMax),
            education: str((req as Record<string, unknown>).education),
          })
        : undefined,
    salary: sal
      ? withoutUndefined<ExtractedSalary>({
          min: num(sal.min),
          max: num(sal.max),
          currency: str(sal.currency),
          period: period === "monthly" || period === "yearly" || period === "lpa" ? period : undefined,
          isNegotiable: typeof sal.isNegotiable === "boolean" ? sal.isNegotiable : undefined,
        })
      : undefined,
    employmentType: str(r.employmentType),
    workMode: str(r.workMode),
    responsibilities: strs(r.responsibilities),
    qualifications: strs(r.qualifications),
    benefits: strs(r.benefits),
    vacancies: num(r.vacancies),
    showSalary: typeof r.showSalary === "boolean" ? r.showSalary : undefined,
    tags: strs(r.tags),
    visibility: str(r.visibility),
    screeningQuestions: Array.isArray(r.screeningQuestions)
      ? (r.screeningQuestions.filter((q) => q && typeof q === "object" && !Array.isArray(q)) as ExtractedScreeningQuestion[])
      : undefined,
  });
}

const titleKey = (t?: string) => (t ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The chat answered with a different job (new title and a description of its
 * own), not an edit of the one on screen: it replaces the draft instead of
 * inheriting the old job's salary, benefits and questions.
 */
export function isDifferentJob(current: ExtractedJob | null, update: ExtractedJob): boolean {
  if (!current) return false;
  const before = titleKey(current.title);
  const after = titleKey(update.title);
  return Boolean(before && after && before !== after && update.description?.trim());
}

/** The form's default upper limit, used when the draft gives only a minimum. */
export const DEFAULT_EXPERIENCE_MAX = 10;

/**
 * The chat's answer applied to the draft on screen. The model returns only the
 * fields it changed, so a field it leaves out keeps its value; a different job
 * replaces the draft. Lists it wrote into the description move to their fields.
 */
export function applyDraftUpdate(current: ExtractedJob | null, raw: unknown): ExtractedJob {
  const update = normalizeDraft(raw);
  if (!current || isDifferentJob(current, update)) return splitJobDescription(update);
  const merged: ExtractedJob = { ...current, ...update };
  if (update.requirements !== undefined && !Array.isArray(update.requirements) && current.requirements !== undefined) {
    merged.requirements = { ...requirementsOf(current), ...update.requirements };
  }
  return splitJobDescription(merged);
}
