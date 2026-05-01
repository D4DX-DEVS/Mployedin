/**
 * AI model router — automatically falls back between Gemini and Claude
 * based on availability and task type.
 */

import { createHash } from "crypto";
import { generateText, generateStream, GEMINI_MODELS } from "@/lib/ai/gemini";
import { AI_TOKEN_LIMITS } from "@/lib/ai/sanitize";
import logger from "@/lib/logger";
import AICache, { CACHE_TTL_SEC } from "@/models/AICache";
import { connectDB } from "@/lib/db/mongoose";

export type AITask =
  | "chat"
  | "cv_extract"
  | "job_match"
  | "skills_gap"
  | "report"
  | "job_description"
  | "nl_search";

const TASK_MODEL_MAP: Record<AITask, keyof typeof GEMINI_MODELS> = {
  chat: "flash",
  cv_extract: "flash",
  job_match: "flash",
  skills_gap: "flash",
  report: "pro",
  job_description: "flash",
  nl_search: "flash",
};

/**
 * Route a text generation request through the appropriate model.
 * Falls back to flash if the preferred model is unavailable.
 * Results are cached in MongoDB via AICache (TTL per task type).
 */
export async function routeGenerate(
  prompt: string,
  task: AITask = "chat",
  options?: { jsonMode?: boolean; maxTokens?: number }
): Promise<string> {
  const modelKey = TASK_MODEL_MAP[task];
  const model = GEMINI_MODELS[modelKey];
  const maxOutputTokens = options?.maxTokens ?? AI_TOKEN_LIMITS[task];
  const jsonMode = options?.jsonMode ?? false;

  // Check cache first
  const hash = createHash("sha256").update(`${task}:${prompt}`).digest("hex");
  try {
    await connectDB();
    const cached = await AICache.findOne({ hash }).lean();
    if (cached) {
      logger.debug({ task, hash }, "AI cache hit");
      return cached.result;
    }
  } catch (cacheErr) {
    logger.warn({ err: cacheErr }, "AI cache read failed, proceeding without cache");
  }

  let result: string;
  try {
    result = await generateText(prompt, model, maxOutputTokens, jsonMode);
  } catch (err: unknown) {
    // Fallback to flash on error
    if (model !== GEMINI_MODELS.flash) {
      logger.warn({ err, model, task }, "AI model failed, falling back to flash");
      result = await generateText(prompt, GEMINI_MODELS.flash, maxOutputTokens, jsonMode);
    } else {
      throw err;
    }
  }

  // Store in cache (fire-and-forget — don't block the response)
  const ttlSec = CACHE_TTL_SEC[task];
  AICache.create({
    hash,
    task,
    result,
    expiresAt: new Date(Date.now() + ttlSec * 1000),
  }).catch((err) => logger.warn({ err }, "AI cache write failed"));

  return result;
}

/**
 * Invalidate a cached AI response (e.g. when the cached result is malformed).
 */
export async function invalidateAICache(task: AITask, prompt: string): Promise<void> {
  const hash = createHash("sha256").update(`${task}:${prompt}`).digest("hex");
  try {
    await connectDB();
    await AICache.deleteOne({ hash });
  } catch (err) {
    logger.warn({ err }, "AI cache invalidation failed");
  }
}

/**
 * Route a streaming generation request.
 */
export async function routeStream(
  prompt: string,
  task: AITask = "chat"
): Promise<AsyncIterable<string>> {
  const modelKey = TASK_MODEL_MAP[task];
  const model = GEMINI_MODELS[modelKey];

  try {
    return await generateStream(prompt, model);
  } catch (err: unknown) {
    if (model !== GEMINI_MODELS.flash) {
      logger.warn({ err, model, task }, "AI stream model failed, falling back to flash");
      return await generateStream(prompt, GEMINI_MODELS.flash);
    }
    throw err;
  }
}
