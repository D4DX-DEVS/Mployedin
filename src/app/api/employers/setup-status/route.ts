import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";

interface StepResult {
  id: string;
  label: string;
  description: string;
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
    const steps: StepResult[] = [
      {
        id: "company_profile",
        label: "Complete Company Profile",
        description: "Add company name, industry and contact email",
        href: "/employer/settings?tab=profile&highlight=companyName",
        completed: hasProfile,
      },
      {
        id: "add_contact",
        label: "Add Contact Details",
        description: "Add your website and phone number",
        href: "/employer/settings?tab=contact&highlight=website",
        completed: hasContact,
      },
      {
        id: "create_job",
        label: "Create Your First Job",
        description: "Post a job to start receiving applications",
        href: "/employer/jobs/new",
        completed: hasJob,
      },
    ];

    // Only show job-detail steps once a job exists
    if (hasJob) {
      steps.push(
        {
          id: "add_requirements",
          label: "Add Requirements & Skills",
          description: "Define skills and experience needed for the role",
          href: "/employer/jobs",
          completed: hasRequirements,
        },
        {
          id: "set_salary",
          label: "Set Salary Range",
          description: "Specify compensation to attract the right candidates",
          href: "/employer/jobs",
          completed: Boolean(hasSalary),
        },
        {
          id: "publish_job",
          label: "Review & Publish",
          description: "Make your job live to start receiving applications",
          href: "/employer/jobs",
          completed: isPublished,
        },
      );
    }

    const allDone = steps.every((s) => s.completed);

    return NextResponse.json({ steps, allDone });
  } catch (err) {
    console.error("[Setup Status Error]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
