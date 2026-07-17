import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { auth } from "@/lib/auth/config";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { sanitizeHtml } from "@/lib/security/sanitize-html";

export const runtime = "nodejs";

/**
 * POST /api/jobs/auto-draft
 * Called via navigator.sendBeacon when employer navigates away from job form.
 * Creates or updates a draft so the job is not lost.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse(null, { status: 401 });
    }

    const userId = (session.user as unknown as { id: string }).id;
    await connectDB();

    const employer = await Employer.findOne({ userId }).select("_id").lean();
    if (!employer) {
      return new NextResponse(null, { status: 403 });
    }

    const body = await req.json();

    // Only save if there's at least a title
    if (!body.title || typeof body.title !== "string" || body.title.trim().length < 3) {
      return new NextResponse(null, { status: 204 });
    }

    // Check for existing recent draft with same title for this employer
    const existingDraft = await Job.findOne({
      employerId: employer._id,
      status: "draft",
      title: body.title.trim(),
      deletedAt: null,
    }).select("_id").lean();

    const sanitizedDescription = body.description
      ? sanitizeHtml(body.description)
      : "";

    const draftData = {
      title: body.title.trim().slice(0, 200),
      category: body.category?.slice(0, 200) || "",
      description: sanitizedDescription,
      location: {
        country: body.location?.country?.slice(0, 100) || "",
        city: body.location?.city?.slice(0, 100) || "",
        isRemote: Boolean(body.location?.isRemote),
      },
      requirements: {
        skills: Array.isArray(body.requirements?.skills)
          ? body.requirements.skills.filter(Boolean).slice(0, 30)
          : [],
        preferredSkills: Array.isArray(body.requirements?.preferredSkills)
          ? body.requirements.preferredSkills.filter(Boolean).slice(0, 30)
          : [],
        experienceMin: Number(body.requirements?.experienceMin) || 0,
        experienceMax: Number(body.requirements?.experienceMax) || 10,
        education:
          typeof body.requirements?.education === "string"
            ? body.requirements.education.slice(0, 200)
            : undefined,
      },
      salary: {
        min: Number(body.salary?.min) || 0,
        max: Number(body.salary?.max) || 0,
        currency: body.salary?.currency?.slice(0, 10) || "USD",
        isNegotiable: Boolean(body.salary?.isNegotiable),
      },
      showSalary: Boolean(body.showSalary),
      employmentType: body.employmentType || undefined,
      workMode: body.workMode || undefined,
      vacancies: Number(body.vacancies) || undefined,
      status: "draft",
      employerId: employer._id,
      postedBy: userId,
    };

    if (existingDraft) {
      await Job.updateOne({ _id: existingDraft._id }, { $set: draftData });
    } else {
      // Drafts are intentionally partial (description/location may be empty) —
      // schema validation would 500 a title-only draft. Publishing re-validates.
      await new Job(draftData).save({ validateBeforeSave: false });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
