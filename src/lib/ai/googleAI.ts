/**
 * Google Gemini API — the single place that knows who our AI provider is.
 *
 * History, so nobody re-litigates it: OpenRouter (Gemini via proxy) → Muse AI
 * (Meta Model API, 2026-09-16, same day reverted) → Gemini API direct. Muse
 * Spark is a reasoning model that spends 250–1100 tokens thinking before the
 * first visible character and the account could not reach Muse Image at all;
 * Gemini 2.5 Flash-Lite is the cheapest text model Google sells, has thinking
 * off by default, and the key was already in `.env` for speech-to-text.
 *
 * Transport
 * ---------
 * Text, tool calling, streaming and embeddings go through Google's
 * OpenAI-compatible endpoint, so the routes keep the request/response shapes
 * they already had. Only two things use the native `generateContent` API:
 * image generation, and multimodal input (CV / job-poster PDFs and images) —
 * the latter only when Google also serves text. When OpenRouter serves text,
 * PDFs and images go there too, as chat content parts (see gemini.ts).
 */

import logger from "@/lib/logger";
import { providerFetch } from "@/lib/ai/providerFetch";
import {
  isOpenRouterTextProvider,
  openRouterChatFetch,
  type OpenRouterRequestOptions,
} from "@/lib/ai/openRouter";

/** Native Gemini API base. Override only to point at a proxy/gateway. */
export const GOOGLE_AI_BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
/** OpenAI-compatible surface of the same API (chat/completions, embeddings). */
export const GOOGLE_AI_OPENAI_BASE = `${GOOGLE_AI_BASE}/openai`;

/**
 * Model ids. The 2.5 family is cheaper on paper but Google answers
 * "no longer available to new users" (404) on projects created after its
 * retirement — this one included — so the defaults are the cheapest models the
 * key can actually reach (verified 2026-09-16).
 */
export const GOOGLE_AI_MODELS = {
  /** Default for every text call — cheapest reachable Gemini, ~1 s per short answer. */
  text: process.env.GEMINI_TEXT_MODEL || "gemini-3.1-flash-lite",
  /** Copilot tool calling and report-grade tasks. Accepts reasoning_effort "none"; rejects "minimal". */
  smart: process.env.GEMINI_SMART_MODEL || "gemini-3.8-flash",
  /** Poster generation, billed per output image. */
  image: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
  /** The model the Atlas vector index was built with (3072 dims) — do not change casually. */
  embedding: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
} as const;

export function getGoogleAiApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY environment variable is not set");
  return key;
}

/** Whether a key is configured, for routes that answer 503 instead of throwing. */
export function hasGoogleAiApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
}

/** Headers for the OpenAI-compatible endpoints. */
export function openAiCompatHeaders(apiKey: string = getGoogleAiApiKey()): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/** Headers for the native generateContent endpoint. */
export function nativeHeaders(apiKey: string = getGoogleAiApiKey()): Record<string, string> {
  return {
    "x-goog-api-key": apiKey,
    "Content-Type": "application/json",
  };
}

export interface ChatContentPart {
  type: "text" | "image_url" | "file";
  text?: string;
  image_url?: { url: string };
  /** OpenRouter's document part: a PDF as a base64 data URL. */
  file?: { filename: string; file_data: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[] | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * JSON mode. The compat layer honours OpenAI's `response_format: json_object`
 * (mapped to `responseMimeType: application/json`); the instruction is kept as
 * belt-and-braces because `parseAIJson` already strips fences either way.
 */
export const JSON_INSTRUCTION =
  "Respond with a single valid JSON value and nothing else. Do not wrap it in markdown code fences and do not add commentary.";

export function jsonModeRequestFields(): Record<string, unknown> {
  return { response_format: { type: "json_object" } };
}

/**
 * Thinking.
 *
 * Gemini Flash models think by default; the thinking is billed as output tokens
 * and shares `max_tokens` with the answer. Muse taught us what that does to a
 * chat product (empty 200s, 5–20 s to first token), so every surface sends an
 * explicit `reasoning_effort` that defaults to `none`. Raise it per surface via
 * env when a task actually needs depth — and check the model accepts the value:
 * 3.8 Flash takes `none` but rejects `minimal` with HTTP 400.
 */
export const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function parseReasoningEffort(raw: string | undefined, fallback: ReasoningEffort): ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(raw ?? "") ? (raw as ReasoningEffort) : fallback;
}

/** Streaming assistant chat (job creator, screening, interview AI…). */
export function chatReasoningEffort(): ReasoningEffort {
  return parseReasoningEffort(process.env.GEMINI_CHAT_REASONING_EFFORT, "none");
}

/** Copilot tool-calling loop. */
export function copilotReasoningEffort(): ReasoningEffort {
  return parseReasoningEffort(process.env.GEMINI_COPILOT_REASONING_EFFORT, "none");
}

/** One-shot generateText / generateMultimodal calls (extraction, matching, reports). */
export function textReasoningEffort(): ReasoningEffort {
  return parseReasoningEffort(process.env.GEMINI_TEXT_REASONING_EFFORT, "none");
}

const DEFAULT_THINKING_BUDGET = 4000;

/**
 * `max_tokens` for a completion: the visible-answer limit the caller already
 * sizes, plus thinking headroom only when thinking is actually enabled.
 */
export function completionBudget(answerTokens: number, effort: ReasoningEffort): number {
  if (effort === "none") return answerTokens;
  const raw = Number(process.env.GEMINI_THINKING_BUDGET);
  return answerTokens + (Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_THINKING_BUDGET);
}

/** Native-API equivalent of `reasoning_effort: none` for the 2.5 family. */
export function nativeThinkingConfig(model: string, effort: ReasoningEffort): Record<string, unknown> {
  if (effort !== "none" || !model.startsWith("gemini-2.5")) return {};
  return { thinkingConfig: { thinkingBudget: 0 } };
}

/**
 * POST to the OpenAI-compatible chat completions endpoint with our timeout rule.
 *
 * Routes to OpenRouter when that provider is configured (see
 * `isOpenRouterTextProvider`), otherwise straight to Google. Both surfaces
 * speak the same request/response shape, so the ~20 call sites above this are
 * unaware of which one answered — only the model id is translated, and only at
 * this boundary. Embeddings and the native generateContent calls below never
 * take this branch: OpenRouter sells no embedding model, and the Atlas index is
 * built on Google's.
 *
 * An explicit `apiKey` argument still forces the Google path, because the only
 * callers that pass one are doing so to validate a Google key.
 */
export async function chatCompletionsFetch(
  body: Record<string, unknown>,
  label: string,
  timeoutMs?: number,
  apiKey?: string,
  /** OpenRouter only (e.g. the flex tier); ignored on the Google-direct path. */
  options?: OpenRouterRequestOptions
): Promise<Response> {
  if (!apiKey && isOpenRouterTextProvider()) {
    return openRouterChatFetch(body, label, timeoutMs, options);
  }
  return providerFetch(
    `${GOOGLE_AI_OPENAI_BASE}/chat/completions`,
    {
      method: "POST",
      headers: openAiCompatHeaders(apiKey ?? getGoogleAiApiKey()),
      body: JSON.stringify(body),
    },
    label,
    timeoutMs
  );
}

export interface NativePart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface NativeGenerateContentResponse {
  candidates?: { content?: { parts?: NativePart[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

/** POST to the native `models/{model}:generateContent` endpoint. */
export async function generateContentFetch(
  model: string,
  body: Record<string, unknown>,
  label: string,
  timeoutMs?: number,
  apiKey: string = getGoogleAiApiKey()
): Promise<Response> {
  return providerFetch(
    `${GOOGLE_AI_BASE}/models/${model}:generateContent`,
    {
      method: "POST",
      headers: nativeHeaders(apiKey),
      body: JSON.stringify(body),
    },
    label,
    timeoutMs
  );
}

/** Concatenate the text parts of a native response. */
export function nativeResponseText(data: NativeGenerateContentResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

/** Map native usage onto the OpenAI-style shape the log line expects. */
export function nativeUsage(data: NativeGenerateContentResponse): ChatUsage | undefined {
  const u = data.usageMetadata;
  if (!u) return undefined;
  return {
    prompt_tokens: u.promptTokenCount ?? 0,
    completion_tokens: u.candidatesTokenCount ?? 0,
    total_tokens: u.totalTokenCount ?? 0,
  };
}

/** Log token usage in the shape the rest of the codebase already emits. */
export function logUsage(model: string, usage: ChatUsage | undefined, startedAt: number): void {
  if (!usage) return;
  logger.info(
    {
      model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      latencyMs: Date.now() - startedAt,
    },
    "AI usage"
  );
}

/** Turn an OpenAI-style SSE response body into an async iterable of text chunks. */
export async function* sseToAsyncIterable(res: Response): AsyncIterable<string> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const chunk = JSON.parse(raw) as { choices: { delta: { content?: string } }[] };
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // malformed chunk — skip
      }
    }
  }
}

/** Map a Gemini HTTP failure onto the user-facing wording the UI already expects. */
export function providerErrorMessage(
  status: number,
  bodyText: string,
  what = "request",
  /**
   * Which provider answered. Defaults to whoever serves text, but the native
   * `generateContent` calls — image generation, and PDF / image input when
   * Google serves text — always go to Google, so they pass "google"
   * explicitly. Getting this wrong sends whoever is debugging a 401 to the
   * wrong dashboard and the wrong key.
   */
  provider: "google" | "openrouter" | "auto" = "auto",
): string {
  const viaOpenRouter =
    provider === "auto" ? isOpenRouterTextProvider() : provider === "openrouter";
  const who = viaOpenRouter ? "OpenRouter" : "Gemini";
  const keyName = viaOpenRouter ? "OPENROUTER_API_KEY" : "GEMINI_API_KEY";
  const topUp = viaOpenRouter ? "openrouter.ai/credits" : "Google AI Studio";

  if (status === 401 || status === 403) {
    return `${who} rejected the API key. Please check ${keyName}.`;
  }
  if (status === 402) {
    return `${who} billing limit reached. Please add credits in ${topUp}.`;
  }
  if (status === 429) {
    return `${who} rate limit exceeded. Please wait a moment and try again.`;
  }
  return `${who} ${what} failed (${status}): ${bodyText.slice(0, 200)}`;
}
