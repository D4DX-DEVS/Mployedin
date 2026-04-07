import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_TOKEN_LIMITS, redactPII } from "@/lib/ai/sanitize";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

/**
 * GET /api/ai/skills-suggest
 *
 * Returns AI-suggested skills based on the current job seeker's profile
 * and trending skills in their category/industry.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const rl = checkRateLimitDual(_req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).lean();
  if (!seeker) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: AI_TOKEN_LIMITS.skills_suggest },
  });
  const text = redactPII(result.response.text()).replace(/```json\n?|```/g, "").trim();

  let suggestions;
  try {
    suggestions = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "AI response could not be parsed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ suggestions });
});
