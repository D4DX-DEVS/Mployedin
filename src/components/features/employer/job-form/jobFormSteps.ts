import type { JobAssistChangeField } from "@/lib/ai/jobAssist";
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
  // Three steps since 2026-11-11 (owner): details + requirements share a
  // page, and screening questions sit under pay and settings.
  2: ["description", "responsibilities", "qualifications", "benefits", "learningOutcomes", "requirements"],
  3: ["salary", "vacancies", "showSalary", "discloseCompany", "maxApplicants", "expiresAt", "visibility", "tags", "matchingWeights", "workflowTemplateId", "screeningQuestions"],
};

/** Field (or server `details[].path` root) → the step that shows it. */
export const STEP_FOR_PATH: Record<string, number> = Object.fromEntries(
  Object.entries(STEP_FIELDS).flatMap(([step, fields]) => fields.map((f) => [f as string, Number(step)])),
);

/** The assistant names a change by its own field names; these are the form fields behind the ones that differ. */
const ASSIST_FIELD_PATH: Partial<Record<JobAssistChangeField, keyof JobFormValues>> = {
  skills: "requirements",
  preferredSkills: "requirements",
  experienceMin: "requirements",
  experienceMax: "requirements",
  education: "requirements",
  addScreeningQuestions: "screeningQuestions",
};

/**
 * The step to open so the user can see what the assistant changed: the next
 * step after `current` holding a change, else any other step holding one,
 * else `current` (every change is already on screen).
 */
export function stepToViewAssistChanges(fields: readonly JobAssistChangeField[], current: number): number {
  const steps = [...new Set(fields.map((f) => STEP_FOR_PATH[ASSIST_FIELD_PATH[f] ?? f]).filter((s): s is number => s !== undefined))].sort((a, b) => a - b);
  return steps.find((s) => s > current) ?? steps.find((s) => s !== current) ?? current;
}

/** The earliest step holding one of these invalid fields, or null when none is known. */
export function firstInvalidStep(fieldNames: readonly string[]): number | null {
  const steps = fieldNames.map((name) => STEP_FOR_PATH[name.split(".")[0]]).filter((s): s is number => s !== undefined);
  return steps.length ? Math.min(...steps) : null;
}

/** Starter prompts the side assistant can offer (keys of `jobAssistant.quick`). */
type AssistantStarter = "fillMissing" | "description" | "questions" | "wording";

const STARTERS_FIRST_STEP: readonly AssistantStarter[] = ["fillMissing", "description"];
const STARTERS_LATER_STEPS: readonly AssistantStarter[] = ["fillMissing", "wording"];

/**
 * Two starters, not four: the ones the open step does not already offer as a
 * button of its own. "Write the description" sits on the description box
 * (step 2) and "Suggest screening questions" on the questions card (step 3),
 * so the side panel does not repeat them there. Returns a stable array.
 */
export function assistantStartersForStep(step: number): readonly AssistantStarter[] {
  return step <= 1 ? STARTERS_FIRST_STEP : STARTERS_LATER_STEPS;
}
