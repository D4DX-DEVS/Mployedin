import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import PosterGeneration from "@/models/PosterGeneration";
import { generateImages } from "@/lib/ai/openai";
import { uploadBuffer } from "@/lib/storage/spaces";
import { buildPosterPrompt } from "@/lib/composer/prompt-builder";
import { getLayoutForVariation } from "@/lib/composer/layouts";
import { CREDITS_PER_MORE_VARIATIONS, hasCredits, getCreditLimitForPlan, getNextResetDate } from "@/lib/composer/credits";
import { FORMAT_TO_AI_SIZE } from "@/lib/composer/types";
import type { PosterType, PosterFormat, DesignStyle } from "@/lib/composer/types";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import { nanoid } from "nanoid";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const moreSchema = z.object({
  generationId: z.string().min(1),
});

/**
 * POST /api/ai/poster-more-variations
 * Generate 2 additional AI poster background variations for an existing generation.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await validateBody(req, moreSchema);

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId });
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  // Get existing generation
  const posterGen = await PosterGeneration.findById(body.generationId);
  if (!posterGen || String(posterGen.employerId) !== String(employer._id)) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  // Initialize credits if needed
  if (!employer.posterCredits) {
    employer.posterCredits = {
      used: 0,
      limit: getCreditLimitForPlan(employer.subscriptionType),
      resetDate: getNextResetDate(),
    };
  }

  // Auto-reset
  if (new Date() >= new Date(employer.posterCredits.resetDate)) {
    employer.posterCredits.used = 0;
    employer.posterCredits.resetDate = getNextResetDate();
  }

  if (!hasCredits(employer.posterCredits, CREDITS_PER_MORE_VARIATIONS)) {
    return NextResponse.json(
      { error: "Insufficient poster credits. Please upgrade your plan.", creditsRemaining: 0 },
      { status: 402 },
    );
  }

  // Build prompts using stored settings (different variation indices)
  const existingCount = posterGen.variations.length;
  const primaryFormat: PosterFormat = posterGen.formats[0] as PosterFormat;

  const prompts = [existingCount, existingCount + 1].map((variationIndex) => ({
    prompt: buildPosterPrompt({
      type: posterGen.type as PosterType,
      format: primaryFormat,
      style: posterGen.style as DesignStyle,
      description: posterGen.prompt,
      jobData: { title: "", companyName: "" }, // Will be re-derived from job if needed
      variationIndex,
    }),
    size: FORMAT_TO_AI_SIZE[primaryFormat],
    quality: "medium" as const,
  }));

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

  const newVariations = await Promise.all(
    images.map(async (img, index) => {
      const buffer = Buffer.from(img.b64, "base64");
      const result = await uploadBuffer(buffer, {
        folder: "media",
        contentType: "image/png",
        fileName: `poster-${nanoid(8)}.png`,
      });
      return {
        backgroundUrl: result.url,
        layout: getLayoutForVariation(posterGen.type as PosterType, existingCount + index),
      };
    }),
  );

  // Add variations to existing record
  posterGen.variations.push(...newVariations);
  posterGen.creditsUsed += CREDITS_PER_MORE_VARIATIONS;
  await posterGen.save();

  // Deduct credits
  employer.posterCredits.used += CREDITS_PER_MORE_VARIATIONS;
  await employer.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "poster.more_variations",
    resource: "poster",
    resourceId: posterGen._id.toString(),
    meta: { newCount: posterGen.variations.length, creditsUsed: CREDITS_PER_MORE_VARIATIONS },
    req,
  });

  return NextResponse.json({
    id: posterGen._id,
    variations: posterGen.variations,
    creditsUsed: CREDITS_PER_MORE_VARIATIONS,
    creditsRemaining: employer.posterCredits.limit - employer.posterCredits.used,
  });
}

export const POST = withAuth(postHandler, { aiQuota: true });
