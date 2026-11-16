import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";

/**
 * POST /api/ai/headline-suggest
 *
 * Writes three short resume headlines from what the seeker has entered so far
 * in onboarding (nothing is saved here — the seeker picks or edits one).
 */
const bodySchema = z.object({
  jobTitle: z.string().max(120).optional().default(""),
  /** The job they want — not a job they had. */
  targetRole: z.string().max(120).optional().default(""),
  experienceYears: z.string().max(4).optional().default(""),
  skills: z.array(z.string().max(60)).max(30).optional().default([]),
  industry: z.string().max(120).optional().default(""),
  course: z.string().max(120).optional().default(""),
  specialization: z.string().max(120).optional().default(""),
  fresher: z.boolean().optional().default(false),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const b = parsed.data;
  if (!b.jobTitle && !b.targetRole && !b.skills.length && !b.course) {
    return NextResponse.json({ headlines: [] });
  }

  const context = [
    b.fresher ? "Status: fresher / student, no work experience yet" : "",
    b.jobTitle ? `Current/latest role: ${sanitizeAIInput(b.jobTitle, 120)}` : "",
    b.targetRole ? `Job they are looking for (not held yet): ${sanitizeAIInput(b.targetRole, 120)}` : "",
    b.experienceYears ? `Years of experience: ${sanitizeAIInput(b.experienceYears, 4)}` : "",
    b.industry ? `Industry: ${sanitizeAIInput(b.industry, 120)}` : "",
    b.skills.length ? `Skills: ${sanitizeAIInput(b.skills.slice(0, 15).join(", "), 300)}` : "",
    b.course ? `Education: ${sanitizeAIInput(b.course, 120)}${b.specialization ? ` in ${sanitizeAIInput(b.specialization, 120)}` : ""}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `Write 3 different resume headlines for this job seeker. Each is one line, 6-14 words, no first person, no quotes, no emojis.
Use only the facts below — never invent employers, years or skills.
Vary them: one role-focused, one skills-focused, one goal-focused.

${context}

Return ONLY the 3 headlines, one per line, no numbering.`;

  const text = (await generateText(prompt, GEMINI_MODELS.flash, 200)).trim();
  const headlines = text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter((l) => l.length >= 8 && l.length <= 160)
    .slice(0, 3);

  return NextResponse.json({ headlines });
}, { aiQuota: true });
