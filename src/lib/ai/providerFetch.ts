/**
 * One timeout rule for every outbound AI provider call.
 *
 * `fetch` has no default timeout. A stalled or unfunded provider account left
 * these requests hanging until the hosting platform's gateway gave up, so the
 * browser saw a 504 from the edge instead of the route's own graceful error,
 * and a server worker stayed pinned for the whole window. Every provider call
 * goes through here so that cannot come back one endpoint at a time.
 */
import logger from "@/lib/logger";

/** Ceiling on a single provider round trip (headers, not body). */
export const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 20000);

/** Thrown when the provider did not answer within AI_REQUEST_TIMEOUT_MS. */
export class AiTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`AI provider request timed out after ${timeoutMs}ms (${label})`);
    this.name = "AiTimeoutError";
  }
}

/**
 * `fetch` with an abort timer that stops once response headers arrive — a
 * streamed body is therefore never cut short mid-flight.
 */
export async function providerFetch(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs: number = AI_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      logger.warn({ label, timeoutMs }, "AI provider request timed out");
      throw new AiTimeoutError(label, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
