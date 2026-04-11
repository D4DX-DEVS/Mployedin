import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import { AI_TOKEN_LIMITS, redactPII } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiMatchSchema } from "@/lib/validators/ai";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";

/**
 * POST /api/ai/match
 * Body: { jobId: string, jobSeekerId?: string }
 *
 * Returns an AI-computed match score (0-100) + reasoning breakdown for the
 * job seeker vs a job posting.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();
  const { jobId, jobSeekerId: bodyJobSeekerId, applicationId } = await validateBody(req, aiMatchSchema);

  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const job = await Job.findById(jobId).lean() as Record<string, unknown> | null;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Support both JobSeeker._id and User._id (callers differ between pages)
  let seeker: Record<string, unknown> | null = null;
  if (bodyJobSeekerId) {
    seeker = (await JobSeeker.findById(bodyJobSeekerId).lean() as Record<string, unknown> | null)
          ?? (await JobSeeker.findOne({ userId: bodyJobSeekerId }).lean() as Record<string, unknown> | null);
  }
  if (!seeker) {
    seeker = await JobSeeker.findOne({ userId: ctx.userId }).lean() as Record<string, unknown> | null;
  }
  if (!seeker) return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });

  // Safely extract nested fields
  const jobReqs = job.requirements as { skills?: string[]; experienceMin?: number; experienceMax?: number } | undefined;
  const jobLoc = job.location as { city?: string; country?: string; isRemote?: boolean } | undefined;
  const locationStr = jobLoc?.isRemote
    ? "Remote"
    : [jobLoc?.city, jobLoc?.country].filter(Boolean).join(", ") || "N/A";
  const requiredSkills = (jobReqs?.skills ?? []).join(", ") || "Not specified";
  const expRange = jobReqs ? `${jobReqs.experienceMin ?? 0}–${jobReqs.experienceMax ?? 10}+ years` : "N/A";

  const seekerExperience = seeker.experience as Array<{ jobTitle?: string; isCurrent?: boolean }> | undefined;
  const currentTitle = seekerExperience?.find((e) => e.isCurrent)?.jobTitle ?? "N/A";
  const totalYears = (seeker.totalExperienceYears as number | undefined) ?? "N/A";
  const seekerSkills = (seeker.skills as string[] | undefined ?? []).join(", ") || "Not specified";
  const seekerLangs = (seeker.languages as Array<{ language: string; proficiency: string }> | undefined ?? [])
    .map((l) => `${l.language} (${l.proficiency})`).join(", ") || "N/A";

  const prompt = `You are a recruitment AI. Analyse the match between a job seeker and a job posting.

JOB:
Title: ${job.title}
Category: ${job.category ?? "N/A"}
Location: ${locationStr}
Required Skills: ${requiredSkills}
Experience Required: ${expRange}
Description: ${String(job.description ?? "").slice(0, 500)}

JOB SEEKER PROFILE:
Current Title: ${currentTitle}
Skills: ${seekerSkills}
Years of Experience: ${totalYears}
Nationality: ${seeker.nationality ?? "N/A"}
Languages: ${seekerLangs}

Return a JSON object ONLY (no markdown) with this exact structure:
{
  "score": <integer 0-100>,
  "breakdown": {
    "skills": <integer 0-100>,
    "experience": <integer 0-100>,
    "location": <integer 0-100>,
    "language": <integer 0-100>
  },
  "strengths": [<2-3 short bullet strings>],
  "gaps": [<1-2 short bullet strings>],
  "summary": "<2 sentence match summary>"
}`;

  const text = redactPII(
    await generateText(prompt, GEMINI_MODELS.flash, AI_TOKEN_LIMITS.match)
  ).replace(/```json\n?|```/g, "").trim();

  let matchData;
  try {
    matchData = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "AI response could not be parsed. Please try again." }, { status: 500 });
  }

  // Persist the score back to the Application document if an applicationId was provided
  if (applicationId) {
    await Application.findByIdAndUpdate(applicationId, {
      aiMatchScore: matchData.score,
      matchBreakdown: {
        skills: matchData.breakdown?.skills ?? 0,
        experience: matchData.breakdown?.experience ?? 0,
        overall: matchData.score,
      },
      matchStrengths: matchData.strengths ?? [],
      matchGaps: matchData.gaps ?? [],
    });
  }

  return NextResponse.json({ jobId, ...matchData });
});
