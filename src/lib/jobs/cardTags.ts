import { EDUCATION_CUE } from "@/lib/matching/qualificationLines";

/** "2 years working experience as Accountant", "3+ yrs" — an experience line, not a skill. */
const YEARS_LINE = /\d+\s*\+?\s*(?:years?|yrs?)\b/i;

export interface JobCardTags {
  skills: string[];
  education: string | null;
}

export interface JobCardTagsInput {
  skills?: readonly string[] | null;
  education?: string | null;
  qualifications?: readonly string[] | null;
}

/**
 * Splits what a job card shows into skill chips and one education line.
 * Employers sometimes type degree or years lines into Skills; those are not
 * skills, so they leave the chips. Education comes from the job's education
 * field, else its first degree-like qualification, else a misfiled skill.
 */
export function jobCardTags({ skills, education, qualifications }: JobCardTagsInput): JobCardTags {
  const clean = (skills ?? []).map((s) => s.trim()).filter(Boolean);
  const misfiledEducation = clean.filter((s) => EDUCATION_CUE.test(s));
  const realSkills = clean.filter((s) => !EDUCATION_CUE.test(s) && !YEARS_LINE.test(s));
  const educationLine =
    education?.trim() ||
    (qualifications ?? []).map((q) => q.trim()).find((q) => q && EDUCATION_CUE.test(q)) ||
    misfiledEducation[0] ||
    null;
  return { skills: realSkills, education: educationLine };
}
