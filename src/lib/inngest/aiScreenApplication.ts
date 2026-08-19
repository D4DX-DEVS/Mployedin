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
import { calculateMatchScore, seekerProfileFromDoc, jobProfileFromDoc, type MatchScoreWeights } from "@/lib/matchScore";

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
          .select("title description requirements location salary")
          .lean(),
        JobSeeker.findById(application.jobSeekerId)
          .select("skills languages experience totalExperienceYears preferredCountries preferredSalary currentLocation education cv")
          .lean(),
      ]);
      if (!job || !seeker) return { skipped: true, reason: "job or seeker not found" };

      // Compute deterministic score using feature-based engine
      const seekerProfile = seekerProfileFromDoc(seeker as Parameters<typeof seekerProfileFromDoc>[0]);
      const jobProfile = jobProfileFromDoc(job as Parameters<typeof jobProfileFromDoc>[0]);
      const deterministicScore = calculateMatchScore(seekerProfile, jobProfile);

      // LLM call for narrative fields only (optional — failures don't block score)
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

      const prompt = `You are a recruitment AI. Provide qualitative feedback on the match between this job seeker and job posting.

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

Provide brief qualitative feedback ONLY (no scoring). Return JSON only: {"strengths":[],"gaps":[],"summary":""}`;

      // Use deterministic score (LLM optional for narrative)
      application.aiMatchScore = deterministicScore;
      application.scoredVia = 'deterministic';
      application.matchBreakdown = {
        skills: 0,
        experience: 0,
        overall: deterministicScore,
      };

      // Try to get narrative from LLM, but failure doesn't block the score
      let narrativeData = { strengths: [], gaps: [], summary: "" };
      try {
        const raw = redactPII(
          await generateText(prompt, GEMINI_MODELS.flash, AI_TOKEN_LIMITS.match)
        ).replace(/```json\n?|```/g, "").trim();
        narrativeData = JSON.parse(raw);
      } catch {
        // LLM failure — just use empty narrative
      }

      application.matchStrengths = Array.isArray(narrativeData?.strengths)
        ? narrativeData.strengths.map(String).filter(Boolean)
        : [];
      application.matchGaps = Array.isArray(narrativeData?.gaps)
        ? narrativeData.gaps.map(String).filter(Boolean)
        : [];

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
