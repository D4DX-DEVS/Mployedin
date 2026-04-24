import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import { decrypt } from "@/lib/security/encryption";
import { importLinkedInProfile } from "@/lib/ai/linkedin-import";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/linkedin/import-profile
 *
 * Uses the stored LinkedIn access token + AI to scrape and extract
 * structured profile data from LinkedIn, then returns it for
 * onboarding pre-fill. Also saves extracted data to the JobSeeker profile.
 */
async function handler(
  _req: NextRequest,
  ctx: { userId: string; role: string },
) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  // Get the stored encrypted LinkedIn access token
  const user = await User.findById(ctx.userId)
    .select("+linkedinAccessToken name email avatar")
    .lean() as {
    _id: unknown;
    name: string;
    email: string;
    avatar?: string;
    linkedinAccessToken?: string;
    authProvider?: string;
  } | null;

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.linkedinAccessToken) {
    return NextResponse.json(
      { error: "No LinkedIn connection found. Please sign in with LinkedIn first." },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = decrypt(user.linkedinAccessToken);
  } catch {
    return NextResponse.json(
      { error: "LinkedIn token is invalid. Please re-login with LinkedIn." },
      { status: 400 },
    );
  }

  // Get existing profile for LinkedIn URL
  const jobSeeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("socialLinks headline")
    .lean() as { socialLinks?: { label: string; url: string }[]; headline?: string } | null;

  const linkedInUrl = jobSeeker?.socialLinks?.find(
    (l) => l.label === "LinkedIn",
  )?.url;

  try {
    // AI-powered profile import
    const imported = await importLinkedInProfile(
      accessToken,
      linkedInUrl,
      user.name,
      user.email,
    );

    // Save extracted data to JobSeeker profile (only non-empty fields)
    const update: Record<string, unknown> = {};
    if (imported.headline) update.headline = imported.headline;
    if (imported.location) update.currentLocation = imported.location;
    if (imported.summary) update.summary = imported.summary;
    if (imported.industry) update.industry = imported.industry;
    if (imported.skills?.length) update.skills = imported.skills;
    if (imported.languages?.length) {
      update.languages = imported.languages.map((lang) => ({
        language: lang,
        proficiency: "professional" as const,
      }));
    }
    if (imported.certifications?.length) {
      update.certifications = imported.certifications;
    }
    if (imported.experience?.length) {
      update.experience = imported.experience.map((exp) => ({
        jobTitle: exp.jobTitle,
        company: exp.company,
        startDate: exp.startDate ? new Date(exp.startDate) : undefined,
        endDate: exp.endDate ? new Date(exp.endDate) : undefined,
        isCurrent: exp.isCurrent ?? false,
        description: exp.description,
        country: exp.location,
      }));
      // Derive total experience
      if (imported.experience[0]?.startDate) {
        const earliest = imported.experience
          .map((e) => e.startDate)
          .filter(Boolean)
          .sort()[0];
        if (earliest) {
          const years = Math.floor(
            (Date.now() - new Date(earliest).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
          );
          update.totalExperienceYears = Math.min(years, 50);
          update.totalExperienceMonths = 0;
        }
      }
    }
    if (imported.education?.length) {
      update.education = imported.education.map((edu) => ({
        degree: edu.degree,
        institution: edu.institution,
        field: edu.field,
        graduationDate: edu.endYear ? new Date(`${edu.endYear}-06-01`) : undefined,
      }));
    }

    if (Object.keys(update).length > 0) {
      await JobSeeker.findOneAndUpdate(
        { userId: ctx.userId },
        { $set: update },
      );
    }

    logger.info(
      {
        userId: ctx.userId,
        fieldsImported: Object.keys(update),
        experienceCount: imported.experience?.length ?? 0,
        educationCount: imported.education?.length ?? 0,
        skillsCount: imported.skills?.length ?? 0,
      },
      "LinkedIn AI profile import completed",
    );

    await logActivity({
      ...actorFromCtx(ctx),
      action: "linkedin.profile_import",
      resource: "job_seekers",
      meta: {
        fieldsImported: Object.keys(update),
        experienceCount: imported.experience?.length ?? 0,
        educationCount: imported.education?.length ?? 0,
        skillsCount: imported.skills?.length ?? 0,
      },
    });

    return NextResponse.json({
      success: true,
      imported,
    });
  } catch (err) {
    logger.error({ err, userId: ctx.userId }, "LinkedIn AI import failed");
    return NextResponse.json(
      { error: "Failed to import LinkedIn profile. Please try again." },
      { status: 500 },
    );
  }
}

export const POST = withAuth(handler);
