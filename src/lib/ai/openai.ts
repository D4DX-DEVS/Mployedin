/**
 * Centralized image-generation client — Gemini image model for poster generation.
 * File name and exports kept for callers; the provider underneath is Google.
 *
 * Uses the native generateContent API with an IMAGE response modality. The
 * callers' `size` was always an aspect ratio rather than exact pixels (both
 * previous providers treated it that way too), so it maps onto
 * `imageConfig.aspectRatio`. Billing is per output image.
 */

import logger from "@/lib/logger";
import {
  GOOGLE_AI_MODELS,
  generateContentFetch,
  providerErrorMessage,
  logUsage,
  nativeUsage,
  type NativeGenerateContentResponse,
} from "@/lib/ai/googleAI";

const MODEL = GOOGLE_AI_MODELS.image;

export interface ImageGenerationOptions {
  prompt: string;
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "low" | "medium" | "high";
}

export interface GeneratedImage {
  b64: string;
  /** As reported by the model — usually image/png, occasionally image/jpeg. */
  mimeType: string;
  revisedPrompt?: string;
}

const ASPECT_RATIO: Record<NonNullable<ImageGenerationOptions["size"]>, string> = {
  "1024x1024": "1:1",
  "1536x1024": "3:2",
  "1024x1536": "2:3",
};

/**
 * Generate an image via Gemini. Returns base64-encoded image data.
 */
export async function generateImage(opts: ImageGenerationOptions): Promise<GeneratedImage> {
  const size = opts.size ?? "1024x1024";
  const aspectRatio = ASPECT_RATIO[size] ?? "1:1";
  const start = Date.now();

  const res = await generateContentFetch(
    MODEL,
    {
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio },
      },
    },
    "image",
    // Image generation is slower than a chat completion; give it more room
    // than the shared default before the abort timer fires.
    60000
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(providerErrorMessage(res.status, text, "image generation", "google"));
  }

  const data = (await res.json()) as NativeGenerateContentResponse;
  logUsage(MODEL, nativeUsage(data), start);

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((p) => p.inlineData?.data);
  if (!image?.inlineData) {
    const why = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "empty response";
    throw new Error(`Gemini returned no image data (${why})`);
  }

  logger.info({ model: MODEL, aspectRatio, latencyMs: Date.now() - start }, "Gemini image generated");

  const revisedPrompt = parts.map((p) => p.text ?? "").join(" ").trim() || undefined;
  return { b64: image.inlineData.data, mimeType: image.inlineData.mimeType || "image/png", revisedPrompt };
}

/**
 * Generate multiple images in parallel.
 * Used for poster variation generation (2 at a time).
 */
export async function generateImages(
  prompts: ImageGenerationOptions[],
): Promise<GeneratedImage[]> {
  const results = await Promise.allSettled(prompts.map(generateImage));

  const images: GeneratedImage[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      images.push(r.value);
    } else {
      // `err` is the key pino serialises; `error` printed as `{}` and hid the provider message.
      logger.error({ err: r.reason, promptIndex: i }, "Image generation failed for variation");
      // Re-throw user-friendly errors directly
      throw r.reason;
    }
  }
  return images;
}
