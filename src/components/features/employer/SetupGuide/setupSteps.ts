/**
 * The onboarding checklist, shared by the status endpoint and the card.
 *
 * The endpoint used to ship English labels and send the last three steps to
 * `/employer/jobs` — the list, not the field — so the guide stopped guiding
 * exactly where a new employer needs it most. It now returns step ids plus the
 * id of the job being set up; labels come from `employerSetupGuide.steps.*` and
 * the href resolves to that job's own form.
 */
export interface SetupStep {
  id: SetupStepId;
  /** Key under the "employerSetupGuide.steps" namespace. */
  labelKey: string;
  descriptionKey: string;
  href: string;
  completed: boolean;
}

export const SETUP_STEP_DEFINITIONS = [
  {
    id: "company_profile",
    labelKey: "companyProfile",
    descriptionKey: "companyProfileDesc",
  },
  {
    id: "add_contact",
    labelKey: "addContact",
    descriptionKey: "addContactDesc",
  },
  {
    id: "create_job",
    labelKey: "createJob",
    descriptionKey: "createJobDesc",
  },
  {
    id: "add_requirements",
    labelKey: "addRequirements",
    descriptionKey: "addRequirementsDesc",
  },
  {
    id: "set_salary",
    labelKey: "setSalary",
    descriptionKey: "setSalaryDesc",
  },
  {
    id: "publish_job",
    labelKey: "publishJob",
    descriptionKey: "publishJobDesc",
  },
] as const;

export type SetupStepId = (typeof SETUP_STEP_DEFINITIONS)[number]["id"];

const STEP_DEFINITION_BY_ID = new Map(
  SETUP_STEP_DEFINITIONS.map((definition) => [definition.id as SetupStepId, definition])
);

/**
 * Where a step sends the employer. The three job-detail steps need the job they
 * are about; without one they fall back to the job list, which is why they must
 * only be offered once a job exists.
 */
export function setupStepHref(id: SetupStepId, jobId: string | null): string {
  switch (id) {
    case "company_profile":
      return "/employer/settings?tab=profile&highlight=companyName";
    case "add_contact":
      return "/employer/settings?tab=contact&highlight=website";
    case "create_job":
      // Straight to the creator; "/employer/jobs/new" only redirects here.
      return "/employer/jobs/ai-create";
    case "add_requirements":
      return jobId ? `/employer/jobs/${jobId}/edit?highlight=requirements` : "/employer/jobs";
    case "set_salary":
      return jobId ? `/employer/jobs/${jobId}/edit?highlight=salary` : "/employer/jobs";
    case "publish_job":
      return jobId ? `/employer/jobs/${jobId}` : "/employer/jobs";
  }
}

export function setupStepDefinition(id: SetupStepId) {
  return STEP_DEFINITION_BY_ID.get(id);
}
