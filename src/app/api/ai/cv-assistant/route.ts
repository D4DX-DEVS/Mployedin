import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { generateText, parseAIJson, GEMINI_MODELS } from "@/lib/ai/gemini";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiCvAssistantSchema } from "@/lib/validators/ai";
import { buildCvAssistantPrompt, sanitizeCvAssistantResult, hasCvChanges } from "@/lib/ai/cvAssistant";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";

/**
 * POST /api/ai/cv-assistant — one turn of the CV builder's chat assistant.
 * Returns { reply, changes }: proposed edits the seeker reviews and applies in
 * the builder. Nothing is saved here.
 */
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

  const body = await validateBody(req, aiCvAssistantSchema);
  const input = {
    ...body,
    instruction: sanitizeAIInput(body.instruction, 4000),
    history: body.history.map((m) => ({ role: m.role, content: sanitizeAIInput(m.content, 2000) })),
  };

  let raw: unknown;
  try {
    const text = await generateText(buildCvAssistantPrompt(input), GEMINI_MODELS.flash, 3000, true);
    raw = parseAIJson<unknown>(text);
  } catch (err) {
    logger.error({ err, userId: ctx.userId }, "[cv-assistant] model call or parse failed");
    return NextResponse.json({ error: "The assistant couldn't answer. Try again." }, { status: 502 });
  }

  const result = sanitizeCvAssistantResult(raw, input.cv);
  if (!result.reply && !hasCvChanges(result.changes)) {
    return NextResponse.json({ error: "The assistant couldn't answer. Try again." }, { status: 502 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.cv_assistant",
    resource: "ai",
    meta: { changed: Object.keys(result.changes) },
    req,
  });

  return NextResponse.json(result);
}, { aiQuota: true });
