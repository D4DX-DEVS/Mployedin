/**
 * AI Application Screening — Inngest Function
 *
 * Triggered right after an application is submitted. Computes the AI match score
 * automatically for every application, and applies the employer's auto-reject
 * threshold only when one was configured (aiAutoScreen). Runs asynchronously so the
 * seeker's apply request never blocks on (or fails because of) an LLM call.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { AI_TOKEN_LIMITS, redactPII, sanitizeAIInput } from "@/lib/ai/sanitize";

function sanitizeAiList(values: string[] | undefined, maxItems = 20, maxLength = 80): string {
  const cleaned = (values ?? [])
    .map((value) => sanitizeAIInput(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
  return cleaned.length > 0 ? cleaned.join(", ") : "Not specified";
}

export const aiScreenApplication = inngest.createFunction(
  {
    id: "ai-screen-application",
    name: "AI Screen Application",
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [{ event: "application/ai-screen" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { applicationId: string; autoRejectBelow?: number } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    step: any;
  }) => {
    const { applicationId, autoRejectBelow } = event.data;

    await step.run("connect-db", () => connectDB());

    return step.run("score-application", async () => {
      const application = await Application.findById(applicationId);
      if (!application) return { skipped: true, reason: "application not found" };
      if (application.aiMatchScore != null) return { skipped: true, reason: "already scored" };

      const [job, seeker] = await Promise.all([
        Job.findById(application.jobId)
          .select("title description requirements location")
          .lean(),
        JobSeeker.findById(application.jobSeekerId)
          .select("skills languages experience totalExperienceYears")
          .lean(),
      ]);
      if (!job || !seeker) return { skipped: true, reason: "job or seeker not found" };

      const jobReqs = job.requirements as { skills?: string[]; experienceMin?: number; experienceMax?: number } | undefined;
      const jobLoc = job.location as { city?: string; country?: string; isRemote?: boolean } | undefined;
      const locationStr = sanitizeAIInput(
        jobLoc?.isRemote ? "Remote" : [jobLoc?.city, jobLoc?.country].filter(Boolean).join(", ") || "N/A",
        120
      );
      const seekerExperience = seeker.experience as Array<{ jobTitle?: string; isCurrent?: boolean }> | undefined;
      const currentTitle = sanitizeAIInput(seekerExperience?.find((e) => e.isCurrent)?.jobTitle ?? "N/A", 120);
      const seekerLangs = ((seeker.languages as Array<{ language: string; proficiency: string }> | undefined) ?? [])
        .map((language) => sanitizeAIInput(`${language.language} (${language.proficiency})`, 60))
        .filter(Boolean)
        .join(", ") || "N/A";

      const prompt = `You are a recruitment AI. Score the match between this job seeker and job posting.

JOB:
Title: ${sanitizeAIInput(String(job.title ?? "N/A"), 120)}
Location: ${locationStr}
Required Skills: ${sanitizeAiList(jobReqs?.skills, 20, 60)}
Experience Required: ${sanitizeAIInput(jobReqs ? `${jobReqs.experienceMin ?? 0}–${jobReqs.experienceMax ?? 10}+ years` : "N/A", 40)}
Description: ${sanitizeAIInput(String(job.description ?? ""), 500)}

JOB SEEKER:
Current Title: ${currentTitle}
Skills: ${sanitizeAiList(seeker.skills as string[] | undefined, 25, 60)}
Years of Experience: ${sanitizeAIInput(String(seeker.totalExperienceYears ?? "N/A"), 20)}
Languages: ${seekerLangs}

Return JSON only: {"score":<0-100>,"breakdown":{"skills":<0-100>,"experience":<0-100>,"location":<0-100>},"strengths":[],"gaps":[]}`;

      const raw = redactPII(
        await generateText(prompt, GEMINI_MODELS.flash, AI_TOKEN_LIMITS.match)
      ).replace(/```json\n?|```/g, "").trim();

      const matchData = JSON.parse(raw);
      application.aiMatchScore = matchData.score;
      application.matchBreakdown = {
        skills: matchData.breakdown?.skills ?? 0,
        experience: matchData.breakdown?.experience ?? 0,
        overall: matchData.score,
      };
      application.matchStrengths = matchData.strengths ?? [];
      application.matchGaps = matchData.gaps ?? [];

      // Auto-reject only applications still in "applied" — never override a
      // status the employer has already moved forward.
      if (
        autoRejectBelow !== undefined &&
        application.aiMatchScore < autoRejectBelow &&
        application.status === "applied"
      ) {
        application.status = "rejected";
        application.rejectionReason = `AI match score (${application.aiMatchScore}) below threshold (${autoRejectBelow})`;
        application.statusHistory.push({
          status: "rejected",
          changedAt: new Date(),
          note: "Auto-rejected by AI screening",
        });
      }

      await application.save();
      return { scored: true, score: application.aiMatchScore, autoRejected: application.status === "rejected" };
    });
  }
);
