import { JOB_ASSIST_FIELD_ORDER, type JobAssistChanges, type JobAssistDraft } from "@/lib/ai/jobAssist";

/** The edit page's form, as far as the job assistant reads and writes it. */
export interface EditJobAssistForm {
  title: string;
  description: string;
  category: string;
  location: { country: string; city: string; isRemote: boolean; remoteScope?: "worldwide" | "countries"; remoteCountries?: string[] };
  requirements: { skills: string[]; preferredSkills: string[]; experienceMin: number; experienceMax: number };
  salary: { min: number; max: number; currency: string; period: string; isNegotiable: boolean };
  vacancies: number;
  employmentType: string;
  workMode: string;
  duration: string;
  responsibilities: string[];
  qualifications: string[];
  benefits: string[];
  learningOutcomes: string[];
  screeningQuestions: Array<{ id: string; label: string; type: string; required: boolean; options: string[]; placeholder: string }>;
}

/** A cleared number input holds NaN; the assistant gets nothing rather than a bad value. */
const finite = (n: number) => (Number.isFinite(n) ? n : undefined);

export function editFormToAssistDraft(f: EditJobAssistForm): JobAssistDraft {
  return {
    title: f.title || undefined,
    category: f.category || undefined,
    description: f.description || undefined,
    employmentType: f.employmentType || undefined,
    workMode: f.workMode || undefined,
    duration: f.duration || undefined,
    location: { country: f.location.country || undefined, city: f.location.city || undefined },
    skills: f.requirements.skills,
    preferredSkills: f.requirements.preferredSkills,
    experienceMin: finite(f.requirements.experienceMin),
    experienceMax: finite(f.requirements.experienceMax),
    responsibilities: f.responsibilities,
    qualifications: f.qualifications,
    benefits: f.benefits,
    learningOutcomes: f.learningOutcomes,
    salary: { min: finite(f.salary.min), max: finite(f.salary.max), currency: f.salary.currency, period: f.salary.period },
    vacancies: finite(f.vacancies),
    screeningQuestions: f.screeningQuestions.filter((q) => q.label).map((q) => ({ label: q.label, type: q.type })),
  };
}

type Patch<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : Partial<T[K]>) : T[K] };
export type EditFormPatch = Patch<EditJobAssistForm>;

const NESTED = ["location", "requirements", "salary"] as const;

/** Applies a patch, merging the nested groups one level deep. */
export function mergeEditPatch<F extends EditJobAssistForm>(form: F, patch: EditFormPatch): F {
  const next = { ...form, ...patch } as F;
  for (const key of NESTED) {
    if (patch[key]) (next as EditJobAssistForm)[key] = { ...form[key], ...patch[key] } as never;
  }
  return next;
}

let qSeq = 0;

/** Fields the edit page has — it has no education field. */
export const EDIT_ASSIST_FIELDS = JOB_ASSIST_FIELD_ORDER.filter((f) => f !== "education");

/**
 * The assistant's changes as a patch for the edit form, and how to put back
 * what they replaced: field by field, and for questions only the ones added,
 * so an undo keeps any other edit made since.
 */
export function assistChangesToEditPatch(
  form: EditJobAssistForm,
  c: JobAssistChanges,
): { patch: EditFormPatch; revert: (current: EditJobAssistForm) => EditFormPatch } {
  const patch: EditFormPatch = {};
  const revert: EditFormPatch = {};
  const group = <G extends (typeof NESTED)[number]>(g: G, key: keyof EditJobAssistForm[G], value: unknown) => {
    patch[g] = { ...(patch[g] ?? {}), [key]: value } as never;
    revert[g] = { ...(revert[g] ?? {}), [key]: form[g][key] } as never;
  };
  const top = <K extends keyof EditJobAssistForm>(key: K, value: EditJobAssistForm[K]) => {
    patch[key] = value as never;
    revert[key] = form[key] as never;
  };

  if (c.title !== undefined) top("title", c.title);
  if (c.description !== undefined) top("description", c.description);
  if (c.employmentType !== undefined) top("employmentType", c.employmentType);
  if (c.duration !== undefined) top("duration", c.duration);
  if (c.workMode !== undefined) {
    top("workMode", c.workMode);
    group("location", "isRemote", c.workMode === "remote");
  }
  if (c.location?.country) group("location", "country", c.location.country);
  if (c.location?.city) group("location", "city", c.location.city);
  if (c.skills !== undefined) group("requirements", "skills", c.skills);
  if (c.preferredSkills !== undefined) group("requirements", "preferredSkills", c.preferredSkills);
  if (c.experienceMin !== undefined) group("requirements", "experienceMin", c.experienceMin);
  if (c.experienceMax !== undefined) group("requirements", "experienceMax", c.experienceMax);
  for (const field of ["responsibilities", "qualifications", "benefits", "learningOutcomes"] as const) {
    if (c[field] !== undefined) top(field, c[field]!);
  }
  if (c.salary) {
    for (const key of ["min", "max", "currency", "period"] as const) {
      if (c.salary[key] !== undefined) group("salary", key, c.salary[key]);
    }
  }
  if (c.vacancies !== undefined) top("vacancies", c.vacancies);
  let addedIds: Set<string> | undefined;
  if (c.addScreeningQuestions?.length) {
    const room = Math.max(0, 20 - form.screeningQuestions.length);
    const added = c.addScreeningQuestions.slice(0, room).map((q) => ({
      id: `sq_${Date.now()}_ai${(qSeq++).toString(36)}`,
      label: q.label,
      type: q.type,
      required: q.required ?? false,
      options: q.options ?? [],
      placeholder: "",
    }));
    if (added.length) {
      patch.screeningQuestions = [...form.screeningQuestions, ...added];
      addedIds = new Set(added.map((q) => q.id));
    }
  }
  return {
    patch,
    revert: (current) => (addedIds
      ? { ...revert, screeningQuestions: current.screeningQuestions.filter((q) => !addedIds.has(q.id)) }
      : revert),
  };
}
