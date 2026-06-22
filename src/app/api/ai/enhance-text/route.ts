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

  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await validateBody(req, aiEnhanceTextSchema);

  const text = sanitizeAIInput(body.text, 2000);
  const context = body.context ? sanitizeAIInput(body.context, 200) : "";
  const mode = body.mode ?? "improve";

  const subject = context || "text";
  const sharedRules = `- Do NOT add fictional metrics or facts — only improve wording and structure
- Return ONLY the resulting text, no quotes, labels, or extra formatting`;

  let prompt: string;
  switch (mode) {
    case "shorten":
      prompt = `You are a professional career coach. Rewrite the following ${subject} to be more concise and punchy without losing meaning.

Rules:
- Cut filler words and redundancy; keep it to 1-3 tight sentences or bullet points
- Preserve all key facts, skills, and achievements
${sharedRules}

Original text:
${text}`;
      break;
    case "grammar":
      prompt = `You are a meticulous editor. Correct the spelling, grammar, punctuation, and capitalization of the following ${subject}.

Rules:
- Fix errors only — do NOT change meaning, tone, or add new content
- Keep the original structure (bullets stay bullets)
${sharedRules}

Original text:
${text}`;
      break;
    case "suggest":
      prompt = `You are a professional career coach. Write a strong, original ${subject} based on the details below.

Rules:
- Use strong action verbs (Developed, Spearheaded, Architected, Optimized, etc.)
- Write 2-4 concise, achievement-oriented bullet-point style sentences
- Be realistic and professional; do NOT invent specific metrics or employers
${sharedRules}

Details / topic:
${text}`;
      break;
    case "improve":
    default:
      prompt = `You are a professional career coach. Enhance the following ${subject} to sound more professional, impactful, and achievement-oriented.

Rules:
- Use strong action verbs (Developed, Spearheaded, Architected, Optimized, etc.)
- Quantify achievements where possible
- Keep it concise — 2-4 bullet-point style sentences
- Maintain the same meaning and facts
${sharedRules}

Original text:
${text}`;
      break;
  }

  const enhanced = (await generateText(prompt, GEMINI_MODELS.flash, 512)).trim();

  if (!enhanced) {
    return NextResponse.json({ error: "Failed to enhance text" }, { status: 500 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.enhance_text",
    resource: "ai",
    meta: { mode },
    req,
  });

  return NextResponse.json({ enhanced });
}, { aiQuota: true });
