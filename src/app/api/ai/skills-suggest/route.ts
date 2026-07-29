import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { AI_TOKEN_LIMITS, redactPII } from "@/lib/ai/sanitize";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import logger from "@/lib/logger";

/**
 * GET /api/ai/skills-suggest
 *
 * Returns AI-suggested skills based on the current job seeker's profile
 * and trending skills in their category/industry.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const rl = await checkRateLimitDual(_req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).lean();
  if (!seeker) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const prompt = `You are a career development AI specialized in Gulf region (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman) job markets.

CANDIDATE PROFILE:
Current Title: ${seeker.currentJobTitle ?? "N/A"}
Existing Skills: ${(seeker.skills ?? []).join(", ") || "Not specified"}
Years of Experience: ${seeker.yearsOfExperience ?? "N/A"}
Education: ${seeker.education?.[0]?.degree ?? "N/A"} in ${seeker.education?.[0]?.field ?? "N/A"}

Based on this profile, suggest 8-12 additional skills the candidate should acquire to be more competitive in the Gulf job market.

Return ONLY a JSON array of objects (no markdown):
[
  { "skill": "skill name", "category": "technical|soft|language|certification", "priority": "high|medium|low", "reason": "1 sentence why" },
  ...
]`;

  let text: string;
  try {
    text = redactPII(
      await generateText(prompt, GEMINI_MODELS.flash, AI_TOKEN_LIMITS.skills_suggest)
    ).replace(/```json\n?|```/g, "").trim();
  } catch (error) {
    // Skills management remains usable when the optional AI provider is
    // unavailable or misconfigured. Avoid turning a provider outage into a
    // broken page and do not expose upstream credential details to the client.
    logger.warn({ err: error, userId: ctx.userId }, "AI skill suggestions unavailable");
    return NextResponse.json({
      suggestions: [],
      unavailable: true,
      message: "AI suggestions are temporarily unavailable. You can still add skills manually.",
    });
  }

  let suggestions;
  try {
    suggestions = JSON.parse(text);
  } catch {
    logger.warn({ userId: ctx.userId }, "AI skill suggestions returned invalid JSON");
    return NextResponse.json({
      suggestions: [],
      unavailable: true,
      message: "AI suggestions are temporarily unavailable. You can still add skills manually.",
    });
  }

  return NextResponse.json({ suggestions });
}, { aiQuota: true });
