/**
 * Reads token usage out of a provider response. Deliberately free of database
 * imports: `providerFetch` loads this on every AI call (and in every test that
 * touches it), and the database writer in `usageLog.ts` is loaded only when
 * there is something to record.
 */
import logger from "@/lib/logger";
import { getAiCaller } from "./usageContext";

export interface ExtractedUsage {
  inputTokens: number;
  outputTokens: number;
  /** Billed cost when the provider reports one (OpenRouter `usage.cost`). */
  costUsd?: number;
  model?: string;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Pull token counts out of an OpenAI-style, OpenRouter or native Google JSON body. */
export function extractUsage(json: unknown): ExtractedUsage | null {
  if (!json || typeof json !== "object") return null;
  const body = json as Record<string, unknown>;
  const model = typeof body.model === "string" ? body.model : undefined;
  const usage = body.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object") {
    const cost = typeof usage.cost === "number" ? usage.cost : undefined;
    return {
      inputTokens: num(usage.prompt_tokens) || num(usage.input_tokens),
      outputTokens: num(usage.completion_tokens) || num(usage.output_tokens),
      costUsd: cost,
      model,
    };
  }
  const meta = body.usageMetadata as Record<string, unknown> | undefined;
  if (meta && typeof meta === "object") {
    return {
      inputTokens: num(meta.promptTokenCount),
      outputTokens: num(meta.candidatesTokenCount) + num(meta.thoughtsTokenCount),
      model: typeof body.modelVersion === "string" ? body.modelVersion : model,
    };
  }
  return null;
}

/** The last `usage` carried by an SSE body (OpenAI-style streams put it in the final chunk). */
export function extractUsageFromSse(text: string): ExtractedUsage | null {
  let found: ExtractedUsage | null = null;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const usage = extractUsage(JSON.parse(raw));
      if (usage) found = usage;
    } catch {
      // A partial or non-JSON chunk: keep looking.
    }
  }
  return found;
}

export function providerFromUrl(url: string): string {
  if (url.includes("openrouter.ai")) return "openrouter";
  if (url.includes("googleapis.com")) return "google";
  return "other";
}

/** Model named in the request body or, for the native API, the URL path. */
export function modelFromRequest(url: string, body: unknown): string | undefined {
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as { model?: unknown };
      if (typeof parsed.model === "string") return parsed.model;
    } catch {
      // Not JSON (e.g. multipart): fall through to the URL.
    }
  }
  return /models\/([^:/?]+)/.exec(url)?.[1];
}

/**
 * Read usage from a cloned provider response and record it. Fire-and-forget:
 * callers do not await this, and it never rejects.
 */
export function recordFromResponse(
  res: Response,
  req: { url: string; body: unknown; label: string; startedAt: number },
): void {
  // Jest runs have no database; the writer is exercised through recordAiUsage directly.
  if (process.env.JEST_WORKER_ID && !process.env.AI_USAGE_LOG_IN_TESTS) return;
  // Capture the caller now: the background read below may outlive the request context.
  const caller = getAiCaller();
  void (async () => {
    try {
      if (typeof res.clone !== "function") return;
      const copy = res.clone();
      const type = copy.headers?.get?.("content-type") ?? "";
      let usage: ExtractedUsage | null = null;
      if (res.ok) {
        usage = type.includes("text/event-stream")
          ? extractUsageFromSse(await copy.text())
          : extractUsage(await copy.json().catch(() => null));
      }
      if (!usage && res.ok) return; // e.g. a provider that reports no tokens at all
      const { recordAiUsage } = await import("./usageLog");
      await recordAiUsage({
        usage: usage ?? { inputTokens: 0, outputTokens: 0 },
        model: usage?.model ?? modelFromRequest(req.url, req.body) ?? "unknown",
        provider: providerFromUrl(req.url),
        ok: res.ok,
        latencyMs: Date.now() - req.startedAt,
        label: req.label,
        caller,
      });
    } catch (err) {
      logger.warn({ err, label: req.label }, "[ai-usage] could not read usage");
    }
  })();
}
