/** Qualification levels onboarding asks for, highest first. The label is what the profile stores in `education[].degree`. */
export const QUALIFICATION_OPTIONS = [
  { value: "doctorate", label: "Doctorate/PhD" },
  { value: "masters", label: "Masters/Post-Graduation" },
  // Two choices since 2026-11-12 (D5): one "Graduation/Diploma" chip let a
  // diploma holder read as a graduate to every job asking for a degree.
  { value: "graduation", label: "Graduation (Bachelor's)" },
  { value: "diploma", label: "Diploma / ITI" },
  { value: "12th", label: "12th" },
  { value: "10th", label: "10th" },
  { value: "below_10th", label: "Below 10th" },
] as const;

export type QualificationLevel = (typeof QUALIFICATION_OPTIONS)[number]["value"];

/** Levels that have a course, specialisation and university. */
export const DEGREE_LEVELS: readonly string[] = ["diploma", "graduation", "masters", "doctorate"];

export function qualificationLabel(value: string): string {
  return QUALIFICATION_OPTIONS.find((q) => q.value === value)?.label ?? value;
}

export function qualificationValue(label: string): string {
  return QUALIFICATION_OPTIONS.find((q) => q.label === label)?.value ?? "";
}
