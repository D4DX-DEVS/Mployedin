import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import logger from "@/lib/logger";
import {
  setupStepHref,
  type SetupStepId,
} from "@/components/features/employer/SetupGuide/setupSteps";

/**
 * Labels are resolved client-side from `employerSetupGuide.steps.*`; this route
 * returns only ids, links and completion so an Arabic employer does not get an
 * English checklist.
 */
interface StepResult {
  id: SetupStepId;
  href: string;
  completed: boolean;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const userId = (session.user as unknown as { id: string }).id;
    const employer = await Employer.findOne({ userId })
      .select("companyName companyEmail phone website industry")
      .lean();

    if (!employer) {
      return NextResponse.json({ error: "Employer not found" }, { status: 404 });
    }

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

    const hasSalary =
      firstJob?.salary &&
      typeof (firstJob.salary as { min?: number }).min === "number" &&
      (firstJob.salary as { min?: number }).min! > 0 &&
      typeof (firstJob.salary as { max?: number }).max === "number" &&
      (firstJob.salary as { max?: number }).max! > 0;

    const isPublished = firstJob?.status === "active";

    // Base steps everyone sees
    const step = (id: SetupStepId, completed: boolean): StepResult => ({
      id,
      href: setupStepHref(id, firstJobId),
      completed,
    });

    const steps: StepResult[] = [
      step("company_profile", hasProfile),
      step("add_contact", hasContact),
      step("create_job", hasJob),
    ];

    // The job-detail steps need a job to point at, so they only appear once one
    // exists — otherwise they would fall back to the bare job list.
    if (hasJob) {
      steps.push(
        step("add_requirements", hasRequirements),
        step("set_salary", Boolean(hasSalary)),
        step("publish_job", isPublished),
      );
    }

    const allDone = steps.every((s) => s.completed);

    return NextResponse.json({ steps, allDone });
  } catch (err) {
    logger.error({ err }, "[Setup Status Error]");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
