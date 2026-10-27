import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { validateBody } from "@/lib/validators";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { buildJobAssistPrompt, jobAssistRequestSchema, parseJobAssistResponse } from "@/lib/ai/jobAssist";
import logger from "@/lib/logger";

/** Everyone who writes job postings: the employer (and its team), its agent, and admin. */
const POSTER_ROLES = new Set(["employer", "agent", "admin"]);

/**
 * POST /api/ai/job-assist — the job form's AI assistant. Takes the job as it
 * stands plus what the poster asked for, and returns a reply and the fields
 * to change. Nothing is saved here; the form applies the changes and the
 * poster saves the job as usual.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (!POSTER_ROLES.has(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cheap refusals first: the feature gate reserves one of the month's uses,
  // so a request the rate limit or the body check would turn away must not
  // reach it.
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await validateBody(req, jobAssistRequestSchema);

  const gateErr = await enforceFeatureGate(ctx.userId, ctx.role, { type: "ai", feature: "ai_job_description" });
  if (gateErr) return gateErr;

  let raw: string;
  try {
    // Job advert text only — no candidate or personal data reaches the model.
    raw = await generateText(buildJobAssistPrompt(body), GEMINI_MODELS.flash, 4000, true);
  } catch (err) {
    logger.error({ err }, "job-assist: model call failed");
    return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 502 });
  }

  const result = parseJobAssistResponse(raw);
  if (!result) {
    return NextResponse.json({ error: "AI_UNREADABLE" }, { status: 502 });
  }
  return NextResponse.json(result);
}, { aiQuota: true });
