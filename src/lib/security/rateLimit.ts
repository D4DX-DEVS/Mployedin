/**
 * In-memory rate limiter for Next.js API routes.
 *
 * For production: swap the in-memory store with Upstash Redis
 * using `@upstash/ratelimit`.
 */

import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Global in-memory store — resets on function cold start
const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /** Max requests in the window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
  /** Key prefix for namespacing */
  prefix?: string;
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

/**
 * Check rate limit for a given identifier.
 * Returns `{ allowed: boolean; remaining: number; resetAt: number }`
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULTS.api
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `${config.prefix ?? "rl"}:${identifier}`;
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
    const { allowed, remaining, resetAt } = checkRateLimit(ip, config);

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
export function checkRateLimitDual(
  req: NextRequest,
  userId: string | undefined,
  config: RateLimitConfig = DEFAULTS.api
): { allowed: boolean; remaining: number; resetAt: number } {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";

  // IP-based check
  const ipResult = checkRateLimit(ip, config);
  if (!ipResult.allowed) return ipResult;

  // User-based check (if authenticated)
  if (userId) {
    const userResult = checkRateLimit(`user:${userId}`, config);
    if (!userResult.allowed) return userResult;
    return userResult;
  }

  return ipResult;
}
