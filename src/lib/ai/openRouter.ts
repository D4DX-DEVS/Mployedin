/**
 * OpenRouter — text provider and the gateway to TypeSafe's decision models.
 *
 * Why there are now two providers instead of one
 * ----------------------------------------------
 * OpenRouter sells no embedding model (verified 2026-09-22: zero of its 444
 * models embed), and the Atlas vector index on `jobseekers.searchEmbedding` was
 * built with `gemini-embedding-001` at 3072 dimensions. Moving embeddings would
 * mean re-embedding every profile and rebuilding the index, so embeddings —
 * and the two native-API cases, PDF input and image generation — stay on Google
 * direct. Everything else can run through OpenRouter, which is OpenAI-compatible
 * and therefore a base-URL-and-headers swap rather than a rewrite.
 *
 * Why bother
 * ----------
 * Google's API answers 404 for the 2.5 family **on this project's key**
 * (measured 2026-09-16 — Google still documents and sells 2.5 generally, so
 * this is a project/account condition, not a retirement). OpenRouter serves 2.5
 * to anyone, and at $0.10/$0.40 against $0.25/$1.50 it was 2.5x cheaper in and
 * 3.75x cheaper out. That price gap was the original reason for the swap.
 *
 * Why the price gap is no longer the reason
 * -----------------------------------------
 * Two reasons, in order of importance.
 *
 * 1. **Quality.** Benchmarked 2026-09-22 on this codebase's own two prompts
 *    (job skill extraction and job-title suggestions) against three real live
 *    postings. 2.5-flash-lite breaks the extraction prompt's explicit rules:
 *    given a 103-character description it invented 8 skills off the job title,
 *    and on a rich posting it returned 12 skills of which the first three were
 *    verbatim repeats of what the employer had already listed, padded out with
 *    "Collaboration". Only 45% of what it returned was supported by the text it
 *    was reading. 3.1-flash-lite scored 100% on the same measure, returned 0
 *    for the 103-character job, and repeated nothing. The live damage is
 *    visible in `requirements.aiSkills`: "Senior Backend Engineer" carries 12
 *    near-duplicate paraphrases of one idea, which the 6-skill scoring window
 *    then counts six times over.
 * 2. **It expires.** OpenRouter publishes an `expiration_date` per model and it
 *    reads **2026-10-20** for 2.5-flash-lite, 2.5-flash and 2.5-pro alike.
 *
 * So the defaults are the 3.x models. That costs $0.25/$1.50 — the same as
 * Google direct — which means the split now survives on the 404 above rather
 * than on price. It buys correctness instead, which is the better trade for a
 * number that feeds a 60%-weighted matching component.
 *
 * `OPENROUTER_TEXT_SUNSET` stays because an env override can still pin a
 * retired model; past the date such an override is ignored rather than left to
 * 404 in a cron at 06:00.
 */

import { providerFetch } from "@/lib/ai/providerFetch";

/** OpenAI-compatible surface. Override only to point at a proxy. */
export const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

/**
 * Decisions live on a different, alpha endpoint — a decision model returns a
 * typed choice, not a completion, and OpenRouter rejects it on
 * `/chat/completions` with HTTP 400.
 */
export const OPENROUTER_DECISIONS_URL =
  process.env.OPENROUTER_DECISIONS_URL || "https://openrouter.ai/api/alpha/decisions";

/**
 * The day OpenRouter stops serving the Gemini 2.5 family, from its own
 * `expiration_date` field. Re-check with:
 *
 *     curl -s https://openrouter.ai/api/v1/models | jq '.data[]
 *       | select(.expiration_date) | {id, expiration_date}'
 */
export const OPENROUTER_TEXT_SUNSET = "2026-10-20";

/** Model ids OpenRouter retires on that date. An override naming one is dropped. */
const RETIRING_ON_SUNSET = [
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
];

/** Benchmarked 2026-09-22 against 2.5-flash-lite on this codebase's own prompts. */
const DEFAULTS = {
  text: "google/gemini-3.1-flash-lite",
  smart: "google/gemini-3.8-flash",
} as const;

export function isPastTextSunset(now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(`${OPENROUTER_TEXT_SUNSET}T00:00:00Z`);
}

/**
 * An env override, unless it names a model that no longer exists.
 *
 * Pinning a model is a legitimate thing to do and normally wins outright. But a
 * pin set today keeps working right up until the morning it doesn't, and the
 * first thing to notice would be a cron failing at 06:00. Past the sunset a pin
 * on a retired id is ignored in favour of the default.
 */
function resolveModel(override: string | undefined, fallback: string): string {
  if (!override) return fallback;
  if (isPastTextSunset() && RETIRING_ON_SUNSET.includes(override)) return fallback;
  return override;
}

/**
 * Getters, not fields: the sunset has to be evaluated when a call is made, not
 * when the module first loads. A long-lived server process started in September
 * would otherwise still be honouring a retired pin in November.
 */
export const OPENROUTER_MODELS = {
  /** Default for every text call. */
  get text(): string {
    return resolveModel(process.env.OPENROUTER_TEXT_MODEL, DEFAULTS.text);
  },
  /** Tool calling and report-grade tasks. */
  get smart(): string {
    return resolveModel(process.env.OPENROUTER_SMART_MODEL, DEFAULTS.smart);
  },
  /**
   * TypeSafe Jev — a "System One" structured decision model. Returns calibrated
   * probabilities for typed questions instead of prose. Completion tokens are
   * free; only the prompt is billed, at $0.042 per 1M.
   *
   * Not listed in `/api/v1/models`: decision models are served only by the alpha
   * decisions endpoint, so its absence from the catalogue is expected and is not
   * a sign the id is wrong.
   */
  get decision(): string {
    return process.env.OPENROUTER_DECISION_MODEL || "typesafe/jev-1.13";
  },
};

export function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY environment variable is not set");
  return key;
}

export function hasOpenRouterApiKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * Which provider serves plain text calls.
 *
 * Defaults to OpenRouter whenever a key is present, so adding the key is the
 * whole switch; `AI_TEXT_PROVIDER=google` forces the old path back without a
 * deploy. Embeddings and the native multimodal/image calls ignore this entirely.
 */
export function isOpenRouterTextProvider(): boolean {
  const forced = (process.env.AI_TEXT_PROVIDER || "").toLowerCase().trim();
  if (forced === "google") return false;
  if (forced === "openrouter") return true;
  return hasOpenRouterApiKey();
}

/**
 * Translate a Google model id into its OpenRouter equivalent.
 *
 * Call sites index into `GEMINI_MODELS` by logical name (`flash`, `pro`), which
 * resolves to a Google id. Rather than touch ~20 routes, the id is mapped here
 * at the transport boundary. Anything already namespaced (`vendor/model`) is
 * passed through, so an explicit override in env still wins.
 */
export function toOpenRouterModel(modelId: string): string {
  if (modelId.includes("/")) return modelId;
  // The "smart" tier is whatever the Google config calls smart; everything else
  // is the cheap tier. Matching on the family keeps this correct when the
  // Google defaults are bumped.
  const smartId = process.env.GEMINI_SMART_MODEL || "gemini-3.8-flash";
  if (modelId === smartId) return OPENROUTER_MODELS.smart;
  return OPENROUTER_MODELS.text;
}

/**
 * Headers for OpenRouter. `HTTP-Referer` and `X-Title` are optional attribution
 * headers OpenRouter shows on the account's activity page; they make a runaway
 * cron identifiable in the billing breakdown.
 */
export function openRouterHeaders(apiKey: string = getOpenRouterApiKey()): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://mployedin.com",
    "X-Title": "Mployedin",
  };
}

/** POST to OpenRouter's chat completions endpoint, under the shared timeout rule. */
export async function openRouterChatFetch(
  body: Record<string, unknown>,
  label: string,
  timeoutMs?: number,
): Promise<Response> {
  const model = typeof body.model === "string" ? toOpenRouterModel(body.model) : body.model;
  return providerFetch(
    `${OPENROUTER_BASE}/chat/completions`,
    {
      method: "POST",
      headers: openRouterHeaders(),
      body: JSON.stringify({ ...body, model }),
    },
    label,
    timeoutMs,
  );
}
