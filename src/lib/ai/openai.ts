/**
 * Centralized OpenAI client — used for GPT-image-1 poster generation.
 */

import OpenAI from "openai";
import logger from "@/lib/logger";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
  _client = new OpenAI({ apiKey });
  return _client;
}

export interface ImageGenerationOptions {
  prompt: string;
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "low" | "medium" | "high";
}

interface GeneratedImage {
  b64: string;
  revisedPrompt?: string;
}

/**
 * Generate an image using GPT-image-1.
 * Returns base64-encoded PNG data.
 */
export async function generateImage(opts: ImageGenerationOptions): Promise<GeneratedImage> {
  const client = getClient();
  const start = Date.now();

  try {
    const response = await client.images.generate({
      model: "gpt-image-1",
      prompt: opts.prompt,
      n: 1,
      size: opts.size ?? "1024x1024",
      quality: opts.quality ?? "medium",
      output_format: "png",
    });

    const latencyMs = Date.now() - start;
    logger.info(
      { model: "gpt-image-1", size: opts.size ?? "1024x1024", latencyMs },
      "OpenAI image generated",
    );

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      throw new Error("OpenAI returned no image data");
    }

    return {
      b64: imageData.b64_json,
      revisedPrompt: imageData.revised_prompt ?? undefined,
    };
  } catch (err: any) {
    // Surface OpenAI billing/quota errors with a user-friendly message
    if (err?.code === "billing_hard_limit_reached" || err?.status === 402 || err?.error?.code === "billing_hard_limit_reached") {
      throw new Error("OpenAI billing limit reached. Please check your OpenAI account billing settings and add credits.");
    }
    if (err?.code === "insufficient_quota" || err?.error?.code === "insufficient_quota") {
      throw new Error("OpenAI quota exceeded. Please check your OpenAI account billing.");
    }
    if (err?.status === 429) {
      throw new Error("OpenAI rate limit exceeded. Please wait a moment and try again.");
    }
    throw err;
  }
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
      logger.error({ error: r.reason, promptIndex: i }, "Image generation failed for variation");
      // Re-throw user-friendly errors directly
      throw r.reason;
    }
  }
  return images;
}
