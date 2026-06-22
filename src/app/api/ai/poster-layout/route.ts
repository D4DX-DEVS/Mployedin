import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { POSTER_LAYOUT_PROMPT } from "@/lib/ai/assistantPrompts";
import { z } from "zod";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

/* ── request schema ────────────────────────────────────────── */
const inputSchema = z.object({
  /** Free-form user message describing what they want */
  message: z.string().min(2).max(1000).trim(),
  /** Current poster format */
  format: z.enum(["landscape", "square", "story"]),
  /** Template category */
  category: z.string().max(50).default("corporate"),
  /** Current accent color (optional) */
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  /** Whether a background image is loaded */
  hasBackground: z.boolean().default(false),
  /** Current zones on canvas (for context) */
  currentZoneFields: z.array(z.string().max(30)).max(12).default([]),
});

/* ── response validation ───────────────────────────────────── */
const zoneSchema = z.object({
  field: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(2).max(100),
  h: z.number().min(2).max(100),
  fontSize: z.number().min(8).max(120),
  fontWeight: z.number().min(300).max(900),
  color: z.string(),
  align: z.enum(["left", "center", "right"]),
  visible: z.boolean(),
  displayStyle: z.enum(["plain", "pill", "card", "button", "badge"]).optional(),
  bgColor: z.string().optional(),
  borderRadius: z.number().min(0).max(50).optional(),
  padding: z.number().min(0).max(40).optional(),
});

const aiResponseSchema = z.object({
  reply: z.string(),
  zones: z.array(zoneSchema).optional(),
  suggestedAccentColor: z.string().optional(),
  colorPalette: z.array(z.string()).optional(),
});

/**
 * POST /api/ai/poster-layout
 * Chat-style AI assistant for poster template design.
 * Users describe what they want in natural language and the AI
 * returns a conversational reply + optional zone layout.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gateErr = await enforceFeatureGate(ctx.userId, ctx.role, {
    type: "ai",
    feature: "ai_job_description",
  });
  if (gateErr) return gateErr;

  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  let body: z.infer<typeof inputSchema>;
  try {
    const raw = await req.json();
    body = inputSchema.parse(raw);
  } catch (err: unknown) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i: z.ZodIssue) => i.message).join(", ")
        : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const userMessage = sanitizeAIInput(body.message, 1000);
  const format = sanitizeAIInput(body.format, 20);
  const category = sanitizeAIInput(body.category, 50);

  const prompt = `${POSTER_LAYOUT_PROMPT}

CANVAS STATE: format=${format}, category=${category}, accent=${body.accentColor ?? "auto"}, background=${body.hasBackground ? "yes" : "no"}, zones=[${body.currentZoneFields.join(",")}]

ADMIN SAYS: "${userMessage}"

Return ONLY valid JSON.`;

  let rawText: string;
  try {
    rawText = await generateText(prompt, GEMINI_MODELS.flash, 4000);
  } catch {
    return NextResponse.json(
      { error: "AI service is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }

  // Strip markdown fences and trim
  let cleaned = rawText.replace(/```json\n?|```/g, "").trim();

  // Try to extract JSON object if there's extra text around it
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  let result: z.infer<typeof aiResponseSchema>;
  try {
    const parsed = JSON.parse(cleaned);
    result = aiResponseSchema.parse(parsed);
  } catch {
    // Last resort: if we got truncated JSON, return just the reply portion if possible
    const replyMatch = cleaned.match(/"reply"\s*:\s*"([^"]+)"/);
    return NextResponse.json({
      reply: replyMatch?.[1]?.slice(0, 300) ??
        "I generated a layout but the response was too large. Try asking for fewer zones (e.g. 4-5 fields max).",
    });
  }

  // Sanitize zones
  if (result.zones) {
    result.zones = result.zones.map((zone) => ({
      ...zone,
      x: Math.min(Math.max(zone.x, 0), 100 - zone.w),
      y: Math.min(Math.max(zone.y, 0), 100 - zone.h),
      color: /^#[0-9A-Fa-f]{3,6}$/.test(zone.color) ? zone.color : "#FFFFFF",
    }));
  }

  // Validate accent color
  if (result.suggestedAccentColor && !/^#[0-9A-Fa-f]{6}$/.test(result.suggestedAccentColor)) {
    result.suggestedAccentColor = undefined;
  }

  // Validate palette
  if (result.colorPalette) {
    result.colorPalette = result.colorPalette
      .filter((c) => /^#[0-9A-Fa-f]{6}$/.test(c))
      .slice(0, 6);
    if (result.colorPalette.length === 0) result.colorPalette = undefined;
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.poster_layout_generate",
    resource: "ai",
    req,
  });

  return NextResponse.json(result);
}, { aiQuota: true });
