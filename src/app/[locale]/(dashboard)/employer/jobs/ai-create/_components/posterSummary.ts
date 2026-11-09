import { experienceRange, requirementsOf, type ExtractedJob } from "./extractedJob";

/** Lists the poster reading fills, in the order the summary names them. */
export const POSTER_FOUND_KEYS = ["qualifications", "skills", "responsibilities", "benefits"] as const;
export type PosterFoundKey = (typeof POSTER_FOUND_KEYS)[number];

/** Parts of a job a poster often leaves out; each has a one-tap request. */
export const POSTER_MISSING_KEYS = ["responsibilities", "benefits", "qualifications", "salary", "experience"] as const;
export type PosterMissingKey = (typeof POSTER_MISSING_KEYS)[number];

export interface PosterSummary {
  found: { key: PosterFoundKey; count: number }[];
  missing: PosterMissingKey[];
}

const count = (items: string[] | undefined) => (items ?? []).filter((item) => typeof item === "string" && item.trim()).length;

/**
 * What the draft holds and what it still lacks — for the message shown after a
 * poster upload and its one-tap requests. Read from the draft as it is now, so
 * a request drops out once the chat has filled it.
 */
export function summarizeDraft(job: ExtractedJob): PosterSummary {
  const skills = count(requirementsOf(job).skills);
  const counts: Record<PosterFoundKey, number> = {
    qualifications: count(job.qualifications),
    skills,
    responsibilities: count(job.responsibilities),
    benefits: count(job.benefits),
  };
  const salary = job.salary;
  const hasSalary = Boolean(salary && ((salary.min ?? 0) > 0 || (salary.max ?? 0) > 0 || salary.isNegotiable));
  const { min, max } = experienceRange(job);
  const hasExperience = (min ?? 0) > 0 || (max ?? 0) > 0;

  const has: Record<PosterMissingKey, boolean> = {
    responsibilities: counts.responsibilities > 0,
    benefits: counts.benefits > 0,
    qualifications: counts.qualifications > 0,
    salary: hasSalary,
    experience: hasExperience,
  };

  return {
    found: POSTER_FOUND_KEYS.filter((key) => counts[key] > 0).map((key) => ({ key, count: counts[key] })),
    missing: POSTER_MISSING_KEYS.filter((key) => !has[key]),
  };
}
