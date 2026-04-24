import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiEnhanceTextSchema } from "@/lib/validators/ai";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await validateBody(req, aiEnhanceTextSchema);

  const text = sanitizeAIInput(body.text, 2000);
  const context = body.context ? sanitizeAIInput(body.context, 200) : "";

  const prompt = `You are a professional career coach. Enhance the following ${context || "text"} to sound more professional, impactful, and achievement-oriented.

Rules:
- Use strong action verbs (Developed, Spearheaded, Architected, Optimized, etc.)
- Quantify achievements where possible
- Keep it concise — 2-4 bullet-point style sentences
- Do NOT add fictional metrics or facts — only improve wording and structure
- Maintain the same meaning and facts
- Return ONLY the enhanced text, no quotes, labels, or extra formatting

Original text:
${text}`;

  const enhanced = (await generateText(prompt, GEMINI_MODELS.flash, 512)).trim();

  if (!enhanced) {
    return NextResponse.json({ error: "Failed to enhance text" }, { status: 500 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.enhance_text",
    resource: "ai",
    req,
  });

  return NextResponse.json({ enhanced });
});
