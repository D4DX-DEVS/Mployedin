import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { routeGenerate } from "@/lib/ai/router";
import { parseAIJson } from "@/lib/ai/gemini";
import { sanitizeAIInput, redactPII } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiSkillsGapSchema } from "@/lib/validators/ai";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

type GapPriority = "high" | "medium" | "low";

interface NormalizedCriticalGap {
  skill: string;
  priority: GapPriority;
  reason: string;
  learningPath: string;
}

interface NormalizedSkillsGapAnalysis {
  overallScore: number;
  existingStrengths: string[];
  criticalGaps: NormalizedCriticalGap[];
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

  return {
    overallScore,
    existingStrengths,
    criticalGaps,
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
      targetDesc = `${job.title} — Requirements: ${(job.requirements ?? []).join(", ")}`;
    }
  }

  const prompt = `You are a career development AI for the Gulf region job market.

CANDIDATE CURRENT SKILLS: ${dedupedCurrentSkills.join(", ") || "Not specified"}
CANDIDATE CURRENT TITLE: ${seeker.currentJobTitle ?? "N/A"}
YEARS OF EXPERIENCE: ${seeker.yearsOfExperience ?? "N/A"}

TARGET ROLE/JOB: ${targetDesc}

Analyse the skill gap. Return ONLY a JSON object (no markdown):
{
  "overallScore": <integer 0-100, how close they already are>,
  "existingStrengths": [<skill strings that match>],
  "criticalGaps": [{ "skill": "...", "priority": "high|medium|low", "reason": "...", "learningPath": "..." }],
  "estimatedTimeToReady": "<e.g. 3 months>",
  "recommendations": [<3-5 string action items>],
  "summary": "<2-3 sentence overall assessment>"
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

  return NextResponse.json({ analysis, progress, generatedAt: new Date().toISOString() });
});
