/**
 * Rate limiter for Next.js API routes.
 *
 * Uses Upstash Redis (distributed, correct across serverless instances) when
 * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are configured, and
 * transparently falls back to a per-instance in-memory store otherwise (local
 * dev, tests, or if Redis is unreachable). The public API is async so the
 * backing store can be swapped without touching call sites.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Ratelimit as UpstashRatelimit } from "@upstash/ratelimit";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitConfig {
  /** Max requests in the window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
  /** Key prefix for namespacing */
  prefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const DEFAULTS: Record<string, RateLimitConfig> = {
  api: { limit: 100, windowSec: 60 },
  ai: { limit: 20, windowSec: 60 },
  auth: { limit: 10, windowSec: 60 },
  upload: { limit: 5, windowSec: 60 },
  bulk: { limit: 5, windowSec: 60 },
  leads: { limit: 20, windowSec: 60 },
  applications: { limit: 10, windowSec: 60 },
  employers: { limit: 3, windowSec: 60 },
};

// ── In-memory fallback store (per-instance) ─────────────────────────────────
// Resets on cold start; only used when Upstash is not configured / reachable.
const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes. Guarded so HMR/dev reloads don't
// register multiple intervals.
const g = globalThis as unknown as { __rlCleanupRegistered?: boolean };
if (!g.__rlCleanupRegistered) {
  g.__rlCleanupRegistered = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key);
    }
  }, 5 * 60 * 1000).unref?.();
}

function checkInMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSec * 1000;

  let entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;
  const remaining = Math.max(0, config.limit - entry.count);
  const allowed = entry.count <= config.limit;

  return { allowed, remaining, resetAt: entry.resetAt };
}

// ── Upstash Redis backend (lazy, distributed) ───────────────────────────────
type RatelimitClass = (typeof import("@upstash/ratelimit"))["Ratelimit"];

let upstashInitTried = false;
let RatelimitCtor: RatelimitClass | null = null;
let redisClient: import("@upstash/redis").Redis | null = null;
// One Ratelimit instance per distinct limit+window (the limiter bakes those in).
const limiterCache = new Map<string, UpstashRatelimit>();

async function getUpstashLimiter(config: RateLimitConfig): Promise<UpstashRatelimit | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  if (!upstashInitTried) {
    upstashInitTried = true;
    try {
      const [{ Ratelimit }, { Redis }] = await Promise.all([
        import("@upstash/ratelimit"),
        import("@upstash/redis"),
      ]);
      RatelimitCtor = Ratelimit;
      redisClient = new Redis({ url, token });
    } catch (err) {
      console.error("[rateLimit] Upstash init failed — using in-memory fallback:", err);
      RatelimitCtor = null;
      redisClient = null;
    }
  }

  if (!RatelimitCtor || !redisClient) return null;

  const cacheKey = `${config.limit}:${config.windowSec}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new RatelimitCtor({
      redis: redisClient,
      limiter: RatelimitCtor.slidingWindow(config.limit, `${config.windowSec} s`),
      prefix: "mployedin-rl",
      analytics: false,
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Check rate limit for a given identifier.
 * Distributed via Upstash Redis when configured, else per-instance in-memory.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULTS.api
): Promise<RateLimitResult> {
  const key = `${config.prefix ?? "rl"}:${identifier}`;

  const limiter = await getUpstashLimiter(config);
  if (limiter) {
    try {
      const res = await limiter.limit(key);
      return {
        allowed: res.success,
        remaining: Math.max(0, res.remaining),
        // Upstash returns `reset` as a unix timestamp in milliseconds.
        resetAt: res.reset,
      };
    } catch (err) {
      console.error("[rateLimit] Upstash limit() failed — using in-memory fallback:", err);
      // fall through to in-memory so a Redis hiccup never disables protection
    }
  }

  return checkInMemory(key, config);
}

/**
 * HOC that wraps a Next.js route handler with rate limiting.
 *
 * @example
 * export const POST = withRateLimit(handler, { limit: 5, windowSec: 60, prefix: "ai" });
 */
export function withRateLimit(
  handler: (req: NextRequest, ...args: unknown[]) => Promise<NextResponse>,
  config: RateLimitConfig = DEFAULTS.api
) {
  return async (req: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const { allowed, remaining, resetAt } = await checkRateLimit(ip, config);

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(config.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
            "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const response = await handler(req, ...args);
    response.headers.set("X-RateLimit-Limit", String(config.limit));
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    response.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
    return response;
  };
}

export { DEFAULTS as RATE_LIMIT_CONFIGS };

/**
 * Check rate limit using both IP and user ID (dual-key).
 * Both must pass for the request to be allowed.
 */
export async function checkRateLimitDual(
  req: NextRequest,
  userId: string | undefined,
  config: RateLimitConfig = DEFAULTS.api
): Promise<RateLimitResult> {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";

  // IP-based check
  const ipResult = await checkRateLimit(ip, config);
  if (!ipResult.allowed) return ipResult;

  // User-based check (if authenticated)
  if (userId) {
    const userResult = await checkRateLimit(`user:${userId}`, config);
    return userResult;
  }

  return ipResult;
}
