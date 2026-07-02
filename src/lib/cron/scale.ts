/**
 * Cron scale helpers — bound the fan-out of per-document side effects
 * (notifications, emails) so cron routes stay inside request timeouts.
 */
import logger from "@/lib/logger";

/**
 * Run `fn` over `items` with at most `limit` in flight at once.
 * Failures are counted and logged, never thrown — a cron run must not
 * abort wholesale because one notification failed.
 */
// ponytail: chunked allSettled, not a true worker pool — fine at cron sizes
// (≤ a few thousand items); switch to p-limit if per-item latency variance matters.
export async function forEachBounded<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<unknown>,
  label = "cron-task",
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += limit) {
    const results = await Promise.allSettled(items.slice(i, i + limit).map(fn));
    for (const r of results) {
      if (r.status === "fulfilled") {
        ok++;
      } else {
        failed++;
        logger.warn({ err: r.reason, label }, "[cron] task failed");
      }
    }
  }
  return { ok, failed };
}

/** Index an array of docs by stringified `_id` for O(1) join lookups. */
export function byId<T extends { _id: unknown }>(docs: readonly T[]): Map<string, T> {
  return new Map(docs.map((d) => [String(d._id), d]));
}
