import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import PosterGeneration from "@/models/PosterGeneration";
import { Job } from "@/models/Job";
import { generateImages } from "@/lib/ai/openai";
import { uploadBuffer } from "@/lib/storage/spaces";
import { buildPosterPrompt } from "@/lib/composer/prompt-builder";
import { getLayoutForVariation } from "@/lib/composer/layouts";
import { CREDITS_PER_GENERATION, hasCredits, getCreditLimitForPlan, getNextResetDate } from "@/lib/composer/credits";
import { FORMAT_TO_AI_SIZE } from "@/lib/composer/types";
import type { PosterType, PosterFormat, DesignStyle, ShowFields, PosterJobData } from "@/lib/composer/types";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import { nanoid } from "nanoid";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const generateSchema = z.object({
  type: z.enum(["single-job", "bulk-hiring", "urgent-hiring", "walk-in-interview"]),
  formats: z.array(z.enum(["instagram-post", "instagram-story", "linkedin-post", "a4-print"])).min(1).max(4),
  description: z.string().max(300).default(""),
  style: z.enum(["professional", "modern", "creative", "minimal", "bold", "luxury"]),
  jobId: z.string().min(1),
  showFields: z.object({
    salary: z.boolean(),
    location: z.boolean(),
    experience: z.boolean(),
    skills: z.boolean(),
  }),
});

/**
 * POST /api/ai/poster-generate
 * Generate 2 AI poster background variations for a job.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await validateBody(req, generateSchema);

  await connectDB();

  // Verify employer & credits
  const employer = await Employer.findOne({ userId: ctx.userId });
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  // Initialize credits if needed
  if (!employer.posterCredits) {
    employer.posterCredits = {
      used: 0,
      limit: getCreditLimitForPlan(employer.subscriptionType),
      resetDate: getNextResetDate(),
    };
  }

  // Auto-reset if past date
  if (new Date() >= new Date(employer.posterCredits.resetDate)) {
    employer.posterCredits.used = 0;
    employer.posterCredits.resetDate = getNextResetDate();
  }

  if (!hasCredits(employer.posterCredits, CREDITS_PER_GENERATION)) {
    return NextResponse.json(
      { error: "Insufficient poster credits. Please upgrade your plan.", creditsRemaining: 0 },
      { status: 402 },
    );
  }

  // Get job data for smart prompting
  const job = await Job.findById(body.jobId).lean();
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Verify job belongs to this employer
  if (String(job.employerId) !== String(employer._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobData: PosterJobData = {
    title: job.title,
    companyName: employer.companyName,
    employmentType: job.employmentType,
    location: job.location?.city ? `${job.location.city}, ${job.location.country || ""}` : job.location?.country,
    salary: job.salary?.min ? `${job.salary.min}-${job.salary.max} ${job.salary.currency || "AED"}` : undefined,
    experience: job.experienceMin != null ? `${job.experienceMin}-${job.experienceMax || job.experienceMin} years` : undefined,
    skills: job.skills?.slice(0, 6),
    industry: employer.industry,
    category: job.category,
    country: job.location?.country || employer.country,
  };

  // Build prompts for 2 variations
  const primaryFormat: PosterFormat = body.formats[0];
  const prompts = [0, 1].map((variationIndex) => ({
    prompt: buildPosterPrompt({
      type: body.type as PosterType,
      format: primaryFormat,
      style: body.style as DesignStyle,
      description: body.description,
      jobData,
      variationIndex,
    }),
    size: FORMAT_TO_AI_SIZE[primaryFormat],
    quality: "medium" as const,
  }));

  // Generate 2 images in parallel
  let images;
  try {
    images = await generateImages(prompts);
  } catch (err: any) {
    const msg = err?.message || "Image generation failed";
    const isBilling = msg.includes("billing") || msg.includes("quota") || msg.includes("rate limit");
    return NextResponse.json(
      { error: msg },
      { status: isBilling ? 402 : 500 },
    );
  }

  // Upload to S3
  const variations = await Promise.all(
    images.map(async (img, index) => {
      const buffer = Buffer.from(img.b64, "base64");
      const result = await uploadBuffer(buffer, {
        folder: "media",
        contentType: "image/png",
        fileName: `poster-${nanoid(8)}.png`,
      });
      return {
        backgroundUrl: result.url,
        layout: getLayoutForVariation(body.type as PosterType, index),
      };
    }),
  );

  // Deduct credits
  employer.posterCredits.used += CREDITS_PER_GENERATION;
  await employer.save();

  // Save generation record
  const posterGen = await PosterGeneration.create({
    employerId: employer._id,
    jobId: body.jobId,
    type: body.type,
    prompt: body.description.slice(0, 500),
    style: body.style,
    showFields: body.showFields,
    formats: body.formats,
    variations,
    selectedVariation: 0,
    shareSlug: nanoid(10),
    creditsUsed: CREDITS_PER_GENERATION,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "poster.generate",
    resource: "poster",
    resourceId: posterGen._id.toString(),
    meta: { type: body.type, style: body.style, creditsUsed: CREDITS_PER_GENERATION },
    req,
  });

  return NextResponse.json({
    id: posterGen._id,
    variations,
    creditsUsed: CREDITS_PER_GENERATION,
    creditsRemaining: employer.posterCredits.limit - employer.posterCredits.used,
    shareSlug: posterGen.shareSlug,
  });
}

export const POST = withAuth(postHandler, { aiQuota: true });
