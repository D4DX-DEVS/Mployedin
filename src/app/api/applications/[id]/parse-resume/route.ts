import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";

/**
 * POST /api/applications/[id]/parse-resume
 * Triggers CV parsing and attaches extracted data to the application for employer review.
 * This enriches the application with structured data from the candidate's CV.
 */
async function postHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";

  const application = await Application.findById(id).lean();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Response exposes candidate PII (phone, CV URL) — only the employer that
  // owns this application, or an admin, may trigger the parse.
  if (ctx.role === "employer") {
    const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!employer || String(application.employerId) !== String(employer._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobSeeker = await JobSeeker.findById(application.jobSeekerId)
    .select("firstName lastName skills experience education cv summary phone location")
    .lean();

  if (!jobSeeker) return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });

  // Extract structured profile data for the application
  const parsedProfile = {
    name: `${jobSeeker.firstName || ""} ${jobSeeker.lastName || ""}`.trim(),
    skills: jobSeeker.skills || [],
    experience: jobSeeker.experience || [],
    education: jobSeeker.education || [],
    summary: jobSeeker.summary || "",
    phone: jobSeeker.phone || "",
    location: jobSeeker.location || "",
    cvUrl: jobSeeker.cv?.originalUrl || null,
    cvParsedAt: jobSeeker.cv?.parsedAt || null,
  };

  // Store parsed profile snapshot on the application
  await Application.findByIdAndUpdate(id, {
    $set: { parsedProfile },
  });

  await logActivity({
    action: "application.resume_parsed",
    actorId: ctx.userId,
    resource: "Application",
    resourceId: id,
    meta: { skillsCount: parsedProfile.skills.length },
  });

  return NextResponse.json({ parsedProfile, message: "Resume data attached to application" });
}

export const POST = withAuth(postHandler);
