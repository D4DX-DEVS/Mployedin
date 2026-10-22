/**
 * "Have I seen this key in the last `ttlSec` seconds?" with nothing stored on
 * the visitor's device.
 *
 * Uses the same backends as the rate limiter: Upstash Redis when
 * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set (one atomic
 * `SET key 1 NX EX ttl`, correct across serverless instances), otherwise a
 * per-instance in-memory map (local dev, tests).
 */

import logger from "@/lib/logger";

type RedisClient = import("@upstash/redis").Redis;

let redisPromise: Promise<RedisClient | null> | null = null;

/** Lazy and cached as a promise, so concurrent first calls share one client. */
function getRedis(): Promise<RedisClient | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return Promise.resolve(null);

  redisPromise ??= import("@upstash/redis")
    .then(({ Redis }) => new Redis({ url, token }))
    .catch((err: unknown) => {
      logger.error({ err }, "[markOnce] Upstash init failed, using in-memory store");
      return null;
    });
  return redisPromise;
}

// ── In-memory fallback (per instance, resets on cold start) ─────────────────
const SWEEP_EVERY_MS = 5 * 60 * 1000;
/** Hard ceiling on the fallback map, so a flood of distinct keys can't exhaust memory. */
export const IN_MEMORY_MAX_KEYS = 10_000;
// Insertion order is age order (a key is always re-inserted, never updated in
// place), so the first key is the oldest.
const seen = new Map<string, number>(); // key -> expiry (ms since epoch)
let lastSweep = Date.now();

function sweepExpired(now: number): void {
  for (const [k, expiresAt] of seen) {
    if (expiresAt <= now) seen.delete(k);
  }
}

/** How many keys the in-memory fallback holds right now (diagnostics and tests). */
export function inMemoryKeyCount(): number {
  return seen.size;
}

function markInMemory(key: string, ttlSec: number): boolean {
  const now = Date.now();

  // Drop expired keys now and then so the map can't grow without bound. A
  // timer would hold the process open, so sweeping rides on the calls instead.
  if (now - lastSweep >= SWEEP_EVERY_MS) {
    lastSweep = now;
    sweepExpired(now);
  }

  const expiresAt = seen.get(key);
  if (expiresAt !== undefined && expiresAt > now) return false;

  // Re-insert (not update in place) so the key moves to the "newest" end.
  seen.delete(key);
  if (seen.size >= IN_MEMORY_MAX_KEYS) {
    // Full: expired keys go first, then the oldest live ones.
    sweepExpired(now);
    for (const oldest of seen.keys()) {
      if (seen.size < IN_MEMORY_MAX_KEYS) break;
      seen.delete(oldest);
    }
  }
  seen.set(key, now + ttlSec * 1000);
  return true;
}

/**
 * Resolves `true` for the first caller of `key` in the window and `false` for
 * every repeat. A repeat does not extend the window.
 *
 * Rejects if Redis is configured and fails: it deliberately does not fall back
 * to the per-instance map, which would count the same visitor once per server.
 * The caller decides what a failure means.
 */
export async function markOnce(key: string, ttlSec: number): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return markInMemory(key, ttlSec);

  const stored = await redis.set(key, "1", { nx: true, ex: ttlSec });
  return stored === "OK";
}
