import type { JobFormValues } from "./jobFormSchema";

/**
 * Every form field, by the step that shows it. Next validates a step's fields
 * before moving on, and a refused post lands on the step that owns the bad
 * field. Fields used to be missing here — Advanced settings, the step 2 lists,
 * duration — so a bad value in one of them made "Post Job" do nothing at all:
 * validation failed on a field that was not on screen and nothing said so
 * (bug report 2026-10-28: a cleared "Max applicants" box).
 */
export const STEP_FIELDS: Record<number, (keyof JobFormValues)[]> = {
  1: ["title", "category", "employmentType", "duration", "location", "workMode", "employerId", "agentId"],
  2: ["description", "responsibilities", "qualifications", "benefits", "learningOutcomes"],
  3: ["requirements"],
  4: ["salary", "vacancies", "showSalary", "maxApplicants", "expiresAt", "visibility", "tags", "matchingWeights", "workflowTemplateId"],
  5: ["screeningQuestions"],
};

/** Field (or server `details[].path` root) → the step that shows it. */
export const STEP_FOR_PATH: Record<string, number> = Object.fromEntries(
  Object.entries(STEP_FIELDS).flatMap(([step, fields]) => fields.map((f) => [f as string, Number(step)])),
);

/** The earliest step holding one of these invalid fields, or null when none is known. */
export function firstInvalidStep(fieldNames: readonly string[]): number | null {
  const steps = fieldNames.map((name) => STEP_FOR_PATH[name.split(".")[0]]).filter((s): s is number => s !== undefined);
  return steps.length ? Math.min(...steps) : null;
}
