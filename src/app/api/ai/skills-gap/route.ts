import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { routeGenerate } from "@/lib/ai/router";
import { parseAIJson } from "@/lib/ai/gemini";
import { sanitizeAIInput, redactPII } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiSkillsGapSchema } from "@/lib/validators/ai";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

type GapPriority = "high" | "medium" | "low";

interface NormalizedCriticalGap {
  skill: string;
  priority: GapPriority;
  reason: string;
  learningPath: string;
  demandPercent: number;
}

interface NormalizedSkillsGapAnalysis {
  overallScore: number;
  existingStrengths: string[];
  criticalGaps: NormalizedCriticalGap[];
  skillLevels: Record<string, number>;
  estimatedTimeToReady: string;
  recommendations: string[];
  summary: string;
  projectedScore: number;
}

function parsePriority(value: unknown): GapPriority {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return "medium";
}

function normalizeAnalysis(payload: unknown): NormalizedSkillsGapAnalysis {
  const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  const criticalGapsInput = Array.isArray(raw.criticalGaps) ? raw.criticalGaps : [];
  const criticalGaps = criticalGapsInput
    .map((gap) => {
      if (!gap || typeof gap !== "object") {
        if (typeof gap === "string" && gap.trim()) {
          return {
            skill: gap.trim(),
            priority: "medium" as GapPriority,
            reason: "Recommended to close this capability gap.",
            learningPath: "Follow a structured learning path and practice with projects.",
          };
        }
        return null;
      }

      const obj = gap as Record<string, unknown>;
      const skill = String(obj.skill ?? "").trim();
      if (!skill) {
        return null;
      }

      return {
        skill,
        priority: parsePriority(obj.priority),
        reason: String(obj.reason ?? "Build this skill to improve role fit.").trim(),
        learningPath: String(obj.learningPath ?? "Learn fundamentals, ship a mini-project, then validate with interview tasks.").trim(),
        demandPercent: Math.min(100, Math.max(0, Math.round(Number(obj.demandPercent) || 0))),
      };
    })
    .filter((gap): gap is NormalizedCriticalGap => Boolean(gap));

  const existingStrengths = Array.isArray(raw.existingStrengths)
    ? raw.existingStrengths.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const parsedScore = Number(raw.overallScore);
  const overallScore = Number.isFinite(parsedScore) ? Math.min(100, Math.max(0, Math.round(parsedScore))) : 0;
  const projectedScore = Math.min(100, overallScore + criticalGaps.slice(0, 3).reduce((sum, gap) => {
    if (gap.priority === "high") return sum + 8;
    if (gap.priority === "medium") return sum + 5;
    return sum + 3;
  }, 0));

  // Parse skill levels (demand-based percentages from AI)
  const rawSkillLevels = raw.skillLevels && typeof raw.skillLevels === "object" ? raw.skillLevels as Record<string, unknown> : {};
  const skillLevels: Record<string, number> = {};
  for (const [key, val] of Object.entries(rawSkillLevels)) {
    const num = Number(val);
    if (key && Number.isFinite(num)) {
      skillLevels[key.trim()] = Math.min(100, Math.max(0, Math.round(num)));
    }
  }

  return {
    overallScore,
    existingStrengths,
    criticalGaps,
    skillLevels,
    estimatedTimeToReady: String(raw.estimatedTimeToReady ?? "2-4 months").trim() || "2-4 months",
    recommendations,
    summary: String(raw.summary ?? "You have a strong foundation with a few skill gaps to close.").trim(),
    projectedScore,
  };
}

/**
 * POST /api/ai/skills-gap
 * Body: { targetRole?: string, targetJobId?: string }
 *
 * Analyses the gap between the user's current skills and a target role/job.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gateErr = await enforceFeatureGate(ctx.userId, ctx.role, { type: "ai", feature: "ai_skills_gap" });
  if (gateErr) return gateErr;

  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();
  const { targetRole, targetJobId, currentSkills } = await validateBody(req, aiSkillsGapSchema);
  const safeTargetRole = targetRole ? sanitizeAIInput(String(targetRole), 200) : undefined;

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).lean();
  if (!seeker) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const baseSkills: string[] = currentSkills?.length
    ? currentSkills
    : Array.isArray(seeker.skills)
      ? seeker.skills.map((skill: string) => String(skill))
      : [];

  const currentSkillsList = baseSkills
    .map((skill: string) => sanitizeAIInput(String(skill), 80))
    .map((skill: string) => skill.trim())
    .filter(Boolean);

  const seenSkills = new Set<string>();
  const dedupedCurrentSkills = currentSkillsList.filter((skill) => {
    const key = skill.toLowerCase();
    if (seenSkills.has(key)) {
      return false;
    }
    seenSkills.add(key);
    return true;
  });

  let targetDesc = safeTargetRole ?? "general Gulf job market";
  if (targetJobId) {
    const job = await Job.findById(targetJobId).lean();
    if (job) {
      targetDesc = `${job.title} — Requirements: ${(job.requirements?.skills ?? []).join(", ")}`;
    }
  }

  /* ── Aggregate real skill demand from platform jobs ── */
  const roleKeywords = (safeTargetRole ?? "")
    .split(/\s+or\s+/i)
    .map((r) => r.trim())
    .filter(Boolean);
  const titleRegex = roleKeywords.length
    ? new RegExp(roleKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i")
    : null;

  interface SkillDemandEntry {
    skill: string;
    count: number;
    percentage: number;
    isPreferred: boolean;
  }

  let platformMatchingJobs = 0;
  let demandedSkills: SkillDemandEntry[] = [];
  let topMissingFromPlatform: string[] = [];

  if (titleRegex) {
    // Count matching active jobs
    const matchingJobs = await Job.find(
      { status: "active", title: { $regex: titleRegex } },
      { "requirements.skills": 1, "requirements.preferredSkills": 1, title: 1 }
    ).lean();

    platformMatchingJobs = matchingJobs.length;

    if (platformMatchingJobs > 0) {
      // Aggregate skill demand across all matching jobs
      const skillCounts = new Map<string, { required: number; preferred: number }>();
      for (const job of matchingJobs) {
        const reqSkills = job.requirements?.skills ?? [];
        const prefSkills = job.requirements?.preferredSkills ?? [];
        for (const s of reqSkills) {
          const key = s.toLowerCase().trim();
          if (!key) continue;
          const existing = skillCounts.get(key) ?? { required: 0, preferred: 0 };
          existing.required++;
          skillCounts.set(key, existing);
        }
        for (const s of prefSkills) {
          const key = s.toLowerCase().trim();
          if (!key) continue;
          const existing = skillCounts.get(key) ?? { required: 0, preferred: 0 };
          existing.preferred++;
          skillCounts.set(key, existing);
        }
      }

      // Build sorted skill demand list
      demandedSkills = Array.from(skillCounts.entries())
        .map(([skill, counts]) => ({
          skill,
          count: counts.required + counts.preferred,
          percentage: Math.round(((counts.required + counts.preferred) / platformMatchingJobs) * 100),
          isPreferred: counts.required === 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

      // Find skills employers want that the user doesn't have
      const userSkillsLower = new Set(dedupedCurrentSkills.map((s) => s.toLowerCase()));
      topMissingFromPlatform = demandedSkills
        .filter((d) => !userSkillsLower.has(d.skill))
        .slice(0, 10)
        .map((d) => `${d.skill} (required in ${d.percentage}% of ${platformMatchingJobs} jobs)`);
    }
  }

  /* ── Build AI prompt enriched with real platform data ── */
  const platformContext = platformMatchingJobs > 0
    ? `\n\nPLATFORM DATA (from ${platformMatchingJobs} active "${safeTargetRole}" jobs on Mployedin):
TOP SKILLS EMPLOYERS REQUIRE:
${demandedSkills.slice(0, 15).map((d) => `- ${d.skill}: required in ${d.percentage}% of jobs (${d.count}/${platformMatchingJobs})`).join("\n")}

SKILLS THE CANDIDATE IS MISSING (from real employer demand):
${topMissingFromPlatform.length > 0 ? topMissingFromPlatform.map((s) => `- ${s}`).join("\n") : "- None — candidate has all top demanded skills"}

IMPORTANT: Base your overallScore primarily on how well the candidate's skills match what employers on this platform actually require. The skill percentages in "skillLevels" should reflect what percentage of matching jobs require that skill. Critical gaps should prioritize skills that employers on this platform actually demand. You may add 1-2 general market insights but prioritize platform data.`
    : `\n\nNOTE: No active jobs matching "${safeTargetRole ?? "the role"}" were found on the platform. Base your analysis on general Gulf job market knowledge.`;

  const prompt = `You are a career development AI for the Gulf region job market.

CANDIDATE CURRENT SKILLS: ${dedupedCurrentSkills.join(", ") || "Not specified"}
CANDIDATE CURRENT TITLE: ${seeker.currentJobTitle ?? "N/A"}
YEARS OF EXPERIENCE: ${seeker.yearsOfExperience ?? "N/A"}

TARGET ROLE/JOB: ${targetDesc}
${platformContext}

Analyse the skill gap. Return ONLY a JSON object (no markdown):
{
  "overallScore": <integer 0-100, how many of the top demanded skills the candidate already has>,
  "existingStrengths": [<candidate skills that match employer demand>],
  "criticalGaps": [{ "skill": "...", "priority": "high|medium|low", "reason": "...", "learningPath": "...", "demandPercent": <percent of jobs requiring this skill or 0 if unknown> }],
  "skillLevels": { "<skill_name>": <0-100 based on demand match percentage> },
  "estimatedTimeToReady": "<e.g. 3 months>",
  "recommendations": [<3-5 string action items>],
  "summary": "<2-3 sentence overall assessment referencing real platform data when available>"
}`;

  const text = await routeGenerate(prompt, "skills_gap");
  const rawAnalysis = parseAIJson(redactPII(text));
  const analysis = normalizeAnalysis(rawAnalysis);

  const previousScore = Number(seeker.skillsCoachProgress?.lastOverallScore ?? 0);
  const normalizedRole = safeTargetRole ?? targetDesc;
  const previousSkills = Array.isArray(seeker.skills) ? seeker.skills.map((s: string) => s.toLowerCase()) : [];
  const newSkillsAdded = dedupedCurrentSkills.filter((skill) => !previousSkills.includes(skill.toLowerCase())).length;

  const updatedSeeker = await JobSeeker.findOneAndUpdate(
    { userId: ctx.userId },
    {
      $set: {
        "skillsCoachProgress.lastTargetRole": normalizedRole,
        "skillsCoachProgress.previousOverallScore": previousScore,
        "skillsCoachProgress.lastOverallScore": analysis.overallScore,
        "skillsCoachProgress.lastAnalysisAt": new Date(),
      },
      $inc: {
        "skillsCoachProgress.skillsAdded": newSkillsAdded,
        "skillsCoachProgress.analysesCount": 1,
      },
    }
    ,
    { new: true, lean: true }
  );

  const progressData = updatedSeeker?.skillsCoachProgress;
  const progress = {
    previousOverallScore: previousScore,
    lastOverallScore: Number(progressData?.lastOverallScore ?? analysis.overallScore),
    skillsAdded: Number(progressData?.skillsAdded ?? newSkillsAdded),
    analysesCount: Number(progressData?.analysesCount ?? 1),
    lastTargetRole: normalizedRole,
    lastAnalysisAt: progressData?.lastAnalysisAt ? new Date(progressData.lastAnalysisAt).toISOString() : new Date().toISOString(),
  };

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.skills_gap_analyze",
    resource: "ai",
    meta: { targetRole: normalizedRole },
    req,
  });

  return NextResponse.json({
    analysis,
    progress,
    platformData: {
      matchingJobsCount: platformMatchingJobs,
      demandedSkills: demandedSkills.slice(0, 20),
      topMissingSkills: topMissingFromPlatform,
      dataSource: platformMatchingJobs > 0 ? "platform" : "ai_only",
    },
    generatedAt: new Date().toISOString(),
  });
}, { aiQuota: true });
