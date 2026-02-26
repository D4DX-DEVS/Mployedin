import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { routeGenerate } from "@/lib/ai/router";
import { parseAIJson } from "@/lib/ai/gemini";

/**
 * POST /api/ai/skills-gap
 * Body: { targetRole?: string, targetJobId?: string }
 *
 * Analyses the gap between the user's current skills and a target role/job.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { targetRole, targetJobId } = await req.json();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).lean();
  if (!seeker) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  let targetDesc = targetRole ?? "general Gulf job market";
  if (targetJobId) {
    const job = await Job.findById(targetJobId).lean();
    if (job) {
      targetDesc = `${job.title} — Requirements: ${(job.requirements ?? []).join(", ")}`;
    }
  }

  const prompt = `You are a career development AI for the Gulf region job market.

CANDIDATE CURRENT SKILLS: ${(seeker.skills ?? []).join(", ") || "Not specified"}
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
  const analysis = parseAIJson(text);

  return NextResponse.json({ analysis, generatedAt: new Date().toISOString() });
});
