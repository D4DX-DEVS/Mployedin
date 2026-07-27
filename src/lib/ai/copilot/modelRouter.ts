import { GEMINI_MODELS } from "@/lib/ai/gemini";

/**
 * Cost-tiered model routing for the Copilot tool-calling loop.
 *
 * Most Copilot turns are cheap: "what are my leads", "search jobs in Dubai".
 * Those don't need a frontier model — a free/small model with OpenAI-format
 * function-calling is enough. We only pay for a stronger model when the work
 * actually warrants it: the request looks multi-step/ambiguous, or the model
 * is about to (or already did) call a mutating tool this turn, where a wrong
 * argument means a wrong write proposal shown to the user.
 *
 * SMALL_MODEL defaults to an OpenRouter free-tier model — override via env if
 * it becomes unavailable/rate-limited. Either way, callOpenRouter in the chat
 * route falls back to LARGE_MODEL automatically on failure, so a flaky free
 * model degrades to "costs a bit more" rather than breaking the feature.
 */
export const SMALL_MODEL = process.env.OPENROUTER_COPILOT_SMALL_MODEL || "google/gemini-2.0-flash-exp:free";
export const LARGE_MODEL = GEMINI_MODELS.gpt;

interface RoutableMessage {
  role: string;
  content: string;
}

/**
 * Classify a fresh request as "small" (simple lookup/one-shot) or "large"
 * (multi-step, ambiguous, or a long-running conversation) before the first
 * model call. Mutating tool calls escalate mid-loop regardless of this.
 */
export function classifyComplexity(messages: RoutableMessage[]): "small" | "large" {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content ?? "";

  const isLong = text.length > 220;
  const sentenceEnders = (text.match(/[.!?]/g) ?? []).length;
  const looksMultiIntent = sentenceEnders > 2 || /\b(and then|after that|also)\b/i.test(text);
  const isLongRunningConversation = messages.length > 6;

  return isLong || looksMultiIntent || isLongRunningConversation ? "large" : "small";
}
