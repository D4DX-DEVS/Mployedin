/**
 * AI model router — automatically falls back between Gemini and Claude
 * based on availability and task type.
 */

import { generateText, generateStream, GEMINI_MODELS } from "@/lib/ai/gemini";
import type { GenerateContentStreamResult } from "@google/generative-ai";

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
 */
export async function routeGenerate(
  prompt: string,
  task: AITask = "chat"
): Promise<string> {
  const modelKey = TASK_MODEL_MAP[task];
  const model = GEMINI_MODELS[modelKey];

  try {
    return await generateText(prompt, model);
  } catch (err: unknown) {
    // Fallback to flash on error
    if (model !== GEMINI_MODELS.flash) {
      console.warn(`[AI Router] ${model} failed, falling back to flash:`, err);
      return await generateText(prompt, GEMINI_MODELS.flash);
    }
    throw err;
  }
}

/**
 * Route a streaming generation request.
 */
export async function routeStream(
  prompt: string,
  task: AITask = "chat"
): Promise<GenerateContentStreamResult> {
  const modelKey = TASK_MODEL_MAP[task];
  const model = GEMINI_MODELS[modelKey];

  try {
    return await generateStream(prompt, model);
  } catch (err: unknown) {
    if (model !== GEMINI_MODELS.flash) {
      console.warn(`[AI Router] ${model} stream failed, falling back to flash:`, err);
      return await generateStream(prompt, GEMINI_MODELS.flash);
    }
    throw err;
  }
}
