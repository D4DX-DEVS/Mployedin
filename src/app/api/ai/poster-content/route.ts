import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { validateBody } from "@/lib/validators";
import { sanitizeAIInput, redactPII } from "@/lib/ai/sanitize";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { POSTER_DESIGN_PROMPT } from "@/lib/ai/assistantPrompts";
import { z } from "zod";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

const posterInputSchema = z.object({
  title: z.string().min(3).max(200).trim(),
  description: z.string().max(2000).optional(),
  companyName: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  location: z
    .object({
      country: z.string().max(100).optional(),
      city: z.string().max(100).optional(),
      isRemote: z.boolean().optional(),
    })
    .optional(),
  salary: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string().max(10).optional(),
      period: z.string().max(20).optional(),
      isNegotiable: z.boolean().optional(),
    })
    .optional(),
  skills: z.array(z.string().max(100)).max(20).optional(),
  benefits: z.array(z.string().max(200)).max(10).optional(),
  experienceMin: z.number().min(0).max(50).optional(),
  experienceMax: z.number().min(0).max(50).optional(),
  workMode: z.string().max(20).optional(),
  employmentType: z.string().max(20).optional(),
  vacancies: z.number().min(1).max(100).optional(),
});

export interface PosterDesign {
  template: "professional" | "clean" | "social";
  tagline: string;
  highlights: string[];
  cta: string;
  accentColor: string;
  contentPriority: string[];
  socialCaption: string;
}

/**
 * POST /api/ai/poster-content
 * AI-generates a complete poster design specification for a job.
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

  const body = await validateBody(req, posterInputSchema);

  const title = sanitizeAIInput(body.title, 200);
  const description = sanitizeAIInput(body.description ?? "", 1000);
  const companyName = sanitizeAIInput(body.companyName ?? "Company", 200);
  const industry = sanitizeAIInput(body.industry ?? body.category ?? "General", 100);
  const skills = (body.skills ?? []).map((s) => sanitizeAIInput(s, 100)).slice(0, 12);
  const benefits = (body.benefits ?? []).map((b) => sanitizeAIInput(b, 200)).slice(0, 8);

  const locationStr = body.location
    ? `${body.location.city ?? ""}${body.location.city && body.location.country ? ", " : ""}${body.location.country ?? ""}${body.location.isRemote ? " (Remote)" : ""}`
    : "Not specified";

  const salaryStr =
    body.salary?.min || body.salary?.max
      ? `${body.salary.min?.toLocaleString() ?? "0"}–${body.salary.max?.toLocaleString() ?? "0"} ${body.salary.currency ?? "USD"} ${body.salary.period ?? "monthly"}${body.salary.isNegotiable ? " (Negotiable)" : ""}`
      : "Not disclosed";

  const prompt = `${POSTER_DESIGN_PROMPT}

=== BEGIN JOB DATA ===
Job Title: ${title}
Company: ${companyName}
Industry: ${industry}
Description: ${description}
Location: ${locationStr}
Work Mode: ${body.workMode ?? "onsite"}
Employment Type: ${body.employmentType ?? "full_time"}
Salary: ${salaryStr}
Experience: ${body.experienceMin ?? 0}–${body.experienceMax ?? 10} years
Skills: ${skills.length > 0 ? skills.join(", ") : "Not specified"}
Benefits: ${benefits.length > 0 ? benefits.join(", ") : "Standard package"}
Vacancies: ${body.vacancies ?? 1}
=== END JOB DATA ===`;

  const raw = redactPII(await generateText(prompt, GEMINI_MODELS.flash, 2000))
    .replace(/```json\n?|```/g, "")
    .trim();

  let design: PosterDesign;
  try {
    design = JSON.parse(raw) as PosterDesign;
  } catch {
    return NextResponse.json(
      { error: "AI response could not be parsed. Please try again." },
      { status: 500 },
    );
  }

  // Validate and sanitize AI output
  const validTemplates = ["professional", "clean", "social"] as const;
  if (!validTemplates.includes(design.template)) {
    design.template = "professional";
  }
  design.tagline = (design.tagline ?? "We're Hiring!").slice(0, 60);
  design.highlights = (design.highlights ?? []).slice(0, 5).map((h) => String(h).slice(0, 40));
  design.cta = (design.cta ?? "Apply Now!").slice(0, 40);
  design.accentColor =
    /^#[0-9A-Fa-f]{6}$/.test(design.accentColor) ? design.accentColor : "#6366F1";
  design.contentPriority = (design.contentPriority ?? []).slice(0, 6);
  design.socialCaption = (design.socialCaption ?? "").slice(0, 500);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.poster_content_generate",
    resource: "ai",
    req,
  });

  return NextResponse.json({ design });
}, { aiQuota: true });
