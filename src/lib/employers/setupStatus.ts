import type { Types } from "mongoose";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { setupStepHref, type SetupStepId } from "@/components/features/employer/SetupGuide/setupSteps";

export interface EmployerSetupStep {
  id: SetupStepId;
  href: string;
  completed: boolean;
}

export interface EmployerSetupStatus {
  steps: EmployerSetupStep[];
  allDone: boolean;
}

/**
 * The onboarding checklist for one employer, computed from stored data. Shared
 * by the `/api/employers/setup-status` route (the floating guide) and the
 * dashboard loader (the "finish setup" attention row) so both agree.
 *
 * Expects an open Mongoose connection. Returns null when the employer profile
 * does not exist.
 */
export async function getEmployerSetupStatus(
  employerId: Types.ObjectId | string
): Promise<EmployerSetupStatus | null> {
  const employer = await Employer.findById(employerId)
    .select("companyName companyEmail phone website industry")
    .lean();
  if (!employer) return null;

  // Query Jobs collection directly — employer.jobIds may be stale/empty
  const firstJob = await Job.findOne({ employerId: employer._id })
    .sort({ createdAt: 1 })
    .select("requirements salary status")
    .lean();

  const firstJobId = firstJob ? String(firstJob._id) : null;
  const hasJob = firstJob !== null;

  const hasProfile =
    Boolean(employer.companyName?.trim()) &&
    Boolean(employer.companyEmail?.trim()) &&
    Boolean(employer.industry?.trim());

  const hasContact =
    Boolean((employer as { website?: string }).website?.trim()) &&
    Boolean((employer as { phone?: string }).phone?.trim());

  const hasRequirements =
    Array.isArray(firstJob?.requirements?.skills) &&
    (firstJob.requirements.skills as string[]).length > 0;

  const salary = firstJob?.salary as { min?: number; max?: number } | undefined;
  const hasSalary =
    typeof salary?.min === "number" && salary.min > 0 && typeof salary?.max === "number" && salary.max > 0;

  const isPublished = firstJob?.status === "active";

  const step = (id: SetupStepId, completed: boolean): EmployerSetupStep => ({
    id,
    href: setupStepHref(id, firstJobId),
    completed,
  });

  const steps: EmployerSetupStep[] = [
    step("company_profile", hasProfile),
    step("add_contact", hasContact),
    step("create_job", hasJob),
  ];

  // The job-detail steps need a job to point at, so they only appear once one
  // exists — otherwise they would fall back to the bare job list.
  if (hasJob) {
    steps.push(
      step("add_requirements", hasRequirements),
      step("set_salary", hasSalary),
      step("publish_job", isPublished)
    );
  }

  return { steps, allDone: steps.every((s) => s.completed) };
}
