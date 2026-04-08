export interface SetupStep {
  id: string;
  label: string;
  description: string;
  href: string;
  completed: boolean;
}

export const SETUP_STEP_DEFINITIONS = [
  {
    id: "company_profile",
    labelKey: "setupGuide.steps.companyProfile",
    descriptionKey: "setupGuide.steps.companyProfileDesc",
    hrefSuffix: "/employer/settings?tab=profile&highlight=companyName",
  },
  {
    id: "add_contact",
    labelKey: "setupGuide.steps.addContact",
    descriptionKey: "setupGuide.steps.addContactDesc",
    hrefSuffix: "/employer/settings?tab=contact&highlight=website",
  },
  {
    id: "create_job",
    labelKey: "setupGuide.steps.createJob",
    descriptionKey: "setupGuide.steps.createJobDesc",
    hrefSuffix: "/employer/jobs/new",
  },
  {
    id: "add_requirements",
    labelKey: "setupGuide.steps.addRequirements",
    descriptionKey: "setupGuide.steps.addRequirementsDesc",
    hrefSuffix: "/employer/jobs",
  },
  {
    id: "set_salary",
    labelKey: "setupGuide.steps.setSalary",
    descriptionKey: "setupGuide.steps.setSalaryDesc",
    hrefSuffix: "/employer/jobs",
  },
  {
    id: "publish_job",
    labelKey: "setupGuide.steps.publishJob",
    descriptionKey: "setupGuide.steps.publishJobDesc",
    hrefSuffix: "/employer/jobs",
  },
] as const;

export type SetupStepId = (typeof SETUP_STEP_DEFINITIONS)[number]["id"];
