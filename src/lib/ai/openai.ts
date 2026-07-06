/**
 * Centralized image-generation client — OpenRouter (cheap image model) for poster generation.
 * File name kept for callers; provider is now OpenRouter.
 */

import logger from "@/lib/logger";

// ponytail: single cheap image model, override via env if a cheaper/better one appears
const MODEL = process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-2.5-flash-image";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ImageGenerationOptions {
  prompt: string;
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "low" | "medium" | "high";
}

interface GeneratedImage {
  b64: string;
  revisedPrompt?: string;
}

// OpenRouter image models don't take a size param — steer aspect ratio via the prompt.
// Deliberately avoid the word "poster" here — it makes image models bake in headline text.
function aspectHint(size?: string): string {
  switch (size) {
    case "1024x1536": return " Output a tall vertical portrait image (2:3 aspect ratio).";
    case "1536x1024": return " Output a wide horizontal landscape image (3:2 aspect ratio).";
    default: return " Output a square image (1:1 aspect ratio).";
  }
}

/**
 * Generate an image via OpenRouter. Returns base64-encoded PNG data.
 */
export async function generateImage(opts: ImageGenerationOptions): Promise<GeneratedImage> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY environment variable is not set");

  const start = Date.now();

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      modalities: ["image", "text"],
      messages: [{ role: "user", content: opts.prompt + aspectHint(opts.size) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 402) {
      throw new Error("OpenRouter credit limit reached. Please add credits to your OpenRouter account.");
    }
    if (res.status === 429) {
      throw new Error("OpenRouter rate limit exceeded. Please wait a moment and try again.");
    }
    throw new Error(`OpenRouter image generation failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const latencyMs = Date.now() - start;
  logger.info({ model: MODEL, size: opts.size ?? "1024x1024", latencyMs }, "OpenRouter image generated");

  // OpenRouter returns images on message.images[].image_url.url as a data: URL
  const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const b64 = url?.includes(",") ? url.split(",", 2)[1] : undefined;
  if (!b64) {
    throw new Error("OpenRouter returned no image data");
  }

  return { b64 };
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
