/**
 * TypeSafe Jev — structured decision client (OpenRouter `/api/alpha/decisions`).
 *
 * Jev is not a chat model. It takes a `state` (the thing being judged) plus a
 * map of typed `questions`, and answers each one with a calibrated probability
 * rather than prose. That is exactly the shape of "how well does this candidate
 * fit this job", which is why it is worth a second provider.
 *
 * Verified live 2026-09-22 against `typesafe/jev-1.13`:
 *   p50 latency 257ms, 32k context, prompt $0.042/1M, completion FREE.
 *   Calling it on /chat/completions returns HTTP 400 — it needs this endpoint.
 *
 * Three question types:
 *   noul   yes/no        -> { noul: 0..1 }              probability of "true"
 *   choice pick-one      -> { choice, probabilities, confidence }
 *   score  ordinal scale -> { score: 0..1, legend, probabilities, confidence }
 *
 * Everything here degrades to `null` rather than throwing. Job recommendations
 * must still go out when the AI account is unfunded or the endpoint is down —
 * the deterministic scorer is the floor, Jev is the refinement on top.
 */

import logger from "@/lib/logger";
import { providerFetch } from "@/lib/ai/providerFetch";
import {
  OPENROUTER_DECISIONS_URL,
  OPENROUTER_MODELS,
  getOpenRouterApiKey,
  hasOpenRouterApiKey,
  openRouterHeaders,
} from "@/lib/ai/openRouter";

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  /** What "true" and "false" each mean. Both are required by the API. */
  criteria: { true: string; false: string };
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  /** option key -> what that option means. */
  criteria: Record<string, string>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  /** Ordered rungs, lowest first. The answer is normalised to 0..1 across them. */
  criteria: string[];
}

export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}
export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}
export interface JevScoreAnswer {
  type: "score";
  score: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
  confidence?: number;
}
export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
  cost: number;
}

export interface JevResult<K extends string = string> {
  model: string;
  answers: Record<K, JevAnswer>;
  usage?: JevUsage;
  id?: string;
}

/** Decisions are short; they do not need the 20s text budget. */
const DECISION_TIMEOUT_MS = Number(process.env.JEV_TIMEOUT_MS ?? 8000);

export function hasJev(): boolean {
  return hasOpenRouterApiKey() && process.env.JEV_ENABLED !== "false";
}

/**
 * Ask Jev a set of typed questions about one state.
 *
 * Returns `null` on any failure — missing key, timeout, non-200, malformed
 * body. Callers treat `null` as "no AI opinion available" and fall back to the
 * deterministic score. Never let this throw into a cron batch.
 */
export async function decide<K extends string>(
  state: unknown,
  questions: Record<K, JevQuestion>,
  label = "jev",
): Promise<JevResult<K> | null> {
  if (!hasJev()) return null;

  let res: Response;
  try {
    res = await providerFetch(
      OPENROUTER_DECISIONS_URL,
      {
        method: "POST",
        headers: openRouterHeaders(getOpenRouterApiKey()),
        body: JSON.stringify({ model: OPENROUTER_MODELS.decision, state, questions }),
      },
      label,
      DECISION_TIMEOUT_MS,
    );
  } catch (err) {
    logger.warn({ err, label }, "[jev] request failed");
    return null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn({ status: res.status, body: body.slice(0, 300), label }, "[jev] non-200");
    return null;
  }

  try {
    const data = (await res.json()) as JevResult<K>;
    if (!data?.answers) {
      logger.warn({ label }, "[jev] response had no answers");
      return null;
    }
    return data;
  } catch (err) {
    logger.warn({ err, label }, "[jev] unparseable response");
    return null;
  }
}

/** Read a noul probability (0..1), or `null` when the question was not answered. */
export function noulValue(answer: JevAnswer | undefined): number | null {
  return answer && answer.type === "noul" && Number.isFinite(answer.noul) ? answer.noul : null;
}

/** Read a score (0..1), or `null`. */
export function scoreValue(answer: JevAnswer | undefined): number | null {
  return answer && answer.type === "score" && Number.isFinite(answer.score) ? answer.score : null;
}

/** Read a chosen option, or `null`. */
export function choiceValue(answer: JevAnswer | undefined): string | null {
  return answer && answer.type === "choice" && typeof answer.choice === "string" ? answer.choice : null;
}
