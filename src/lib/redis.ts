import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// ─── Singleton Redis Client ─────────────────────────────────────────────────

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables"
      );
    }

    redisInstance = new Redis({ url, token });
  }
  return redisInstance;
}

/** Convenience export for direct import */
export const redis = new Proxy({} as Redis, {
  get(_, prop) {
    return (getRedis() as never)[prop as keyof Redis];
  },
});

// ─── Cache Helpers ──────────────────────────────────────────────────────────

interface RedisCacheOptions {
  /** TTL in seconds. Default: 60 */
  ttl?: number;
}

/**
 * Get-or-set pattern backed by Redis.
 * Works across all serverless instances (no cold-start data loss).
 */
export async function redisCache<T>(
  key: string,
  fetcher: () => T | Promise<T>,
  options: RedisCacheOptions = {}
): Promise<T> {
  const { ttl = 60 } = options;
  const client = getRedis();

  const cached = await client.get<T>(key);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  const value = await fetcher();
  await client.set(key, JSON.stringify(value), { ex: ttl });
  return value;
}

/**
 * Invalidate a single cache key.
 */
export async function invalidateRedisCache(key: string): Promise<void> {
  await getRedis().del(key);
}

/**
 * Invalidate all keys matching a pattern (e.g., "user:123:*").
 * Use sparingly — SCAN is O(N) on the keyspace.
 */
export async function invalidateRedisCacheByPattern(
  pattern: string
): Promise<void> {
  const client = getRedis();
  let cursor: string | number = 0;
  do {
    const [nextCursor, keys] = await client.scan(cursor, {
      match: pattern,
      count: 100,
    });
    cursor = nextCursor;
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } while (cursor !== 0 && cursor !== "0");
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

/**
 * General API rate limiter: 60 requests per 60 seconds sliding window.
 */
export const apiRateLimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  prefix: "ratelimit:api",
});

/**
 * Auth rate limiter: 5 login attempts per 15 minutes.
 */
export const authRateLimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "ratelimit:auth",
});

/**
 * Check rate limit for a given identifier (IP, user ID, etc.).
 * Returns { success, limit, remaining, reset }.
 */
export async function checkRateLimit(
  identifier: string,
  limiter: Ratelimit = apiRateLimit
) {
  return limiter.limit(identifier);
}

// ─── Session / Generic Key-Value ────────────────────────────────────────────

/**
 * Store a value with expiration (useful for OTPs, email verification tokens, etc.)
 */
export async function setWithExpiry(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  await getRedis().set(key, value, { ex: ttlSeconds });
}

/**
 * Get a value (returns null if expired or missing).
 */
export async function getKey(key: string): Promise<string | null> {
  return getRedis().get<string>(key);
}

/**
 * Delete a key.
 */
export async function deleteKey(key: string): Promise<void> {
  await getRedis().del(key);
}
