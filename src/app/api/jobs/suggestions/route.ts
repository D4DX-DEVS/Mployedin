import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput, AI_TOKEN_LIMITS, redactPII } from "@/lib/ai/sanitize";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import logger from "@/lib/logger";

interface SuggestionsResponse {
  titles: string[];
  skills: string[];
  salary: {
    min: number;
    max: number;
    currency: string;
    period: string;
  };
  experience: {
    min: number;
    max: number;
  };
}

/**
 * GET /api/jobs/suggestions?q=<title>&category=<cat>
 * Returns AI-generated job posting suggestions: title variants, popular skills,
 * typical salary range, and experience range for the given job title.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q") ?? "";
  const rawCategory = searchParams.get("category") ?? "";

  if (!rawQ.trim()) {
    return NextResponse.json({ error: "q parameter is required" }, { status: 400 });
  }

  const q = sanitizeAIInput(rawQ, 200);
  const category = sanitizeAIInput(rawCategory, 100);

  const prompt = `You are a recruitment intelligence AI with deep knowledge of global job markets (Middle East/Gulf, India, US, EU).

Given this job title: "${q}" in category: "${category || "General"}"

Return a JSON object (no markdown) with these exact keys:
{
  "titles": ["array of 6 common job title variants for this role"],
  "skills": ["array of 10 most in-demand technical and soft skills for this role"],
  "salary": {
    "min": <typical minimum monthly salary number in USD>,
    "max": <typical maximum monthly salary number in USD>,
    "currency": "USD",
    "period": "monthly"
  },
  "experience": {
    "min": <typical minimum years of experience integer>,
    "max": <typical maximum years of experience integer>
  }
}

Rules:
- skills: mix of technical (60%) and soft skills (40%)
- salary: realistic market rates in USD monthly equivalent
- experience: realistic for mid-level hire
- No extra text, only valid JSON`;

  // Suggestions are a convenience, never a blocker: a provider outage or a reply
  // we can't parse must degrade quietly instead of logging a 500 per keystroke.
  let raw: string;
  try {
    raw = redactPII(
      await generateText(prompt, GEMINI_MODELS.flash, AI_TOKEN_LIMITS.skills_suggest)
    )
      .replace(/```json\n?|```/g, "")
      .trim();
  } catch (err) {
    logger.warn({ err }, "[Job suggestions] provider call failed");
    return NextResponse.json({ error: "Suggestions unavailable" }, { status: 503 });
  }

  let suggestions: SuggestionsResponse;
  try {
    suggestions = JSON.parse(raw) as SuggestionsResponse;
  } catch {
    logger.warn("[Job suggestions] unparseable AI response");
    return NextResponse.json({ error: "Suggestions unavailable" }, { status: 503 });
  }

  return NextResponse.json({ suggestions });
});
