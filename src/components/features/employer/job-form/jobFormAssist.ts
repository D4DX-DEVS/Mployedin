import type { UseFormGetValues, UseFormSetValue } from "react-hook-form";
import type { JobAssistChanges, JobAssistDraft, JobAssistQuestion } from "@/lib/ai/jobAssist";
import type { JobFormValues } from "./jobFormSchema";

type Question = JobFormValues["screeningQuestions"][number];

/** A cleared number input holds NaN; the assistant gets nothing rather than a bad value. */
const finite = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);

/** The wizard's values as the job assistant reads them. */
export function wizardToAssistDraft(v: Partial<JobFormValues>): JobAssistDraft {
  return {
    title: v.title || undefined,
    category: v.category || undefined,
    description: v.description || undefined,
    employmentType: v.employmentType,
    workMode: v.workMode,
    duration: v.duration || undefined,
    location: { country: v.location?.country || undefined, city: v.location?.city || undefined },
    skills: v.requirements?.skills,
    preferredSkills: v.requirements?.preferredSkills,
    experienceMin: finite(v.requirements?.experienceMin),
    experienceMax: finite(v.requirements?.experienceMax),
    education: v.requirements?.education || undefined,
    responsibilities: v.responsibilities,
    qualifications: v.qualifications,
    benefits: v.benefits,
    learningOutcomes: v.learningOutcomes,
    salary: v.salary ? { min: finite(v.salary.min), max: finite(v.salary.max), currency: v.salary.currency, period: v.salary.period } : undefined,
    vacancies: finite(v.vacancies),
    screeningQuestions: v.screeningQuestions?.filter((q) => q.label).map((q) => ({ label: q.label, type: q.type })),
  };
}

let qSeq = 0;
/** A question from the assistant in the shape the job forms store. */
export function assistQuestion(q: JobAssistQuestion, order: number): Question {
  return {
    id: `sq_${Date.now()}_ai${(qSeq++).toString(36)}`,
    label: q.label,
    type: q.type,
    required: q.required ?? false,
    options: q.options ?? [],
    placeholder: "",
    order,
  };
}

const opts = { shouldDirty: true, shouldValidate: true } as const;

/**
 * Writes the assistant's changes into the wizard and returns an undo that
 * puts back exactly the values it replaced.
 */
export function applyAssistToWizard(
  changes: JobAssistChanges,
  getValues: UseFormGetValues<JobFormValues>,
  setValue: UseFormSetValue<JobFormValues>,
): () => void {
  // A copy: react-hook-form mutates nested values in place.
  const before = structuredClone(getValues());
  const restore: Array<() => void> = [];
  const set = <K extends Parameters<UseFormSetValue<JobFormValues>>[0]>(name: K, value: unknown, previous: unknown) => {
    setValue(name, value as never, opts);
    restore.push(() => setValue(name, previous as never, opts));
  };

  if (changes.title !== undefined) set("title", changes.title, before.title);
  if (changes.description !== undefined) set("description", changes.description, before.description);
  if (changes.employmentType !== undefined) set("employmentType", changes.employmentType, before.employmentType);
  if (changes.duration !== undefined) set("duration", changes.duration, before.duration);
  if (changes.workMode !== undefined) {
    set("workMode", changes.workMode, before.workMode);
    set("location.isRemote", changes.workMode === "remote", before.location?.isRemote ?? false);
  }
  if (changes.location?.country) set("location.country", changes.location.country, before.location?.country ?? "");
  if (changes.location?.city) set("location.city", changes.location.city, before.location?.city ?? "");
  if (changes.skills !== undefined) set("requirements.skills", changes.skills, before.requirements?.skills ?? []);
  if (changes.preferredSkills !== undefined) set("requirements.preferredSkills", changes.preferredSkills, before.requirements?.preferredSkills ?? []);
  if (changes.experienceMin !== undefined) set("requirements.experienceMin", changes.experienceMin, before.requirements?.experienceMin ?? 0);
  if (changes.experienceMax !== undefined) set("requirements.experienceMax", changes.experienceMax, before.requirements?.experienceMax ?? 10);
  if (changes.education !== undefined) set("requirements.education", changes.education, before.requirements?.education);
  for (const field of ["responsibilities", "qualifications", "benefits", "learningOutcomes"] as const) {
    if (changes[field] !== undefined) set(field, changes[field], before[field] ?? []);
  }
  if (changes.salary) {
    const s = changes.salary;
    if (s.min !== undefined) set("salary.min", s.min, before.salary?.min ?? 0);
    if (s.max !== undefined) set("salary.max", s.max, before.salary?.max ?? 0);
    if (s.currency !== undefined) set("salary.currency", s.currency, before.salary?.currency ?? "USD");
    if (s.period !== undefined) set("salary.period", s.period, before.salary?.period ?? "monthly");
  }
  if (changes.vacancies !== undefined) set("vacancies", changes.vacancies, before.vacancies);
  if (changes.addScreeningQuestions?.length) {
    const current = before.screeningQuestions ?? [];
    const room = Math.max(0, 20 - current.length);
    const added = changes.addScreeningQuestions.slice(0, room).map((q, i) => assistQuestion(q, current.length + i));
    if (added.length) {
      setValue("screeningQuestions", [...current, ...added], opts);
      // Undo takes out only these questions, so ones added or edited since stay.
      const ids = new Set(added.map((q) => q.id));
      restore.push(() => setValue("screeningQuestions", (getValues().screeningQuestions ?? []).filter((q) => !ids.has(q.id)), opts));
    }
  }

  // Undo in reverse, so paired writes (work mode + remote flag) unwind cleanly.
  return () => { for (const r of restore.reverse()) r(); };
}

/**
 * The same changes applied to a plain values object (a job in a bulk review
 * list, outside any form). Returns a new object; the input is not touched.
 */
export function applyAssistToValues(values: Partial<JobFormValues>, changes: JobAssistChanges): Partial<JobFormValues> {
  const next = structuredClone(values) as Record<string, unknown>;
  const setPath = (name: string, value: unknown) => {
    const parts = name.split(".");
    let node = next;
    for (const p of parts.slice(0, -1)) {
      if (!node[p] || typeof node[p] !== "object") node[p] = {};
      node = node[p] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
  };
  applyAssistToWizard(
    changes,
    (() => next) as unknown as UseFormGetValues<JobFormValues>,
    ((name: string, value: unknown) => setPath(name, value)) as unknown as UseFormSetValue<JobFormValues>,
  );
  return next as Partial<JobFormValues>;
}
