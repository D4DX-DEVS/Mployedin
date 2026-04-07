import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { JobTemplate } from "@/models/JobTemplate";
import Job from "@/models/Job";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// POST /api/employers/job-templates/[id]/use
// Creates a new "draft" Job pre-filled from the template fields.
async function useHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>
) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const template = await JobTemplate.findById(params?.id).lean();
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Ownership check
  if (String(template.employerId) !== String(employer._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Create a draft job from template fields
  const job = await Job.create({
    employerId: employer._id,
    title: template.title ?? "Untitled Job",
    description: template.description ?? "",
    category: template.category,
    requirements: template.requirements ?? { skills: [], experienceMin: 0, experienceMax: 10, languages: [] },
    salary: template.salary ?? { currency: "USD", isNegotiable: false },
    location: template.location ?? { country: "", city: "", isRemote: false },
    tags: template.tags ?? [],
    vacancies: template.vacancies ?? 1,
    workflowMode: template.applicationMode === "auto" ? "auto" : "manual",
    status: "draft",
  });

  // Increment usageCount on the template
  await JobTemplate.updateOne({ _id: template._id }, { $inc: { usageCount: 1 } });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_template.use",
    resource: "jobs",
    resourceId: String(job._id),
    changes: { after: { fromTemplate: template.name, jobId: String(job._id) } },
    req,
  });

  return NextResponse.json({ job: { _id: String(job._id) } }, { status: 201 });
}

export const POST = withAuth(useHandler, { resource: "jobs", action: "create" });
