import crypto from "crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, type RateLimitConfig } from "@/lib/security/rateLimit";

/**
 * Budgets for the MCP surface. ChatGPT and Claude call from shared data-centre
 * IPs, so an IP key would make every connected user share one bucket. The
 * per-token, per-client and per-user keys are the real limits; the IP budgets
 * are only a loose ceiling against floods of made-up tokens and client ids.
 */
export const MCP_RATE_LIMITS = {
  /** One connected app's tool calls. A chat turn is a handful of calls. */
  toolCallsPerToken: { limit: 60, windowSec: 60, prefix: "mcp-call-token" },
  toolCallsPerIp: { limit: 1200, windowSec: 60, prefix: "mcp-call-ip" },
  /** Code exchange + refresh. A healthy client refreshes about once an hour. */
  tokenPerClient: { limit: 20, windowSec: 60, prefix: "mcp-token-client" },
  tokenPerIp: { limit: 300, windowSec: 60, prefix: "mcp-token-ip" },
  revokePerClient: { limit: 20, windowSec: 60, prefix: "mcp-revoke-client" },
  revokePerIp: { limit: 300, windowSec: 60, prefix: "mcp-revoke-ip" },
  /** /authorize is a browser hop, so the IP is the user's own. */
  authorizePerIp: { limit: 30, windowSec: 60, prefix: "mcp-authorize-ip" },
  /** Approving mints an authorization code; nobody approves dozens an hour. */
  consentPerUser: { limit: 20, windowSec: 3600, prefix: "mcp-consent-user" },
} as const satisfies Record<string, RateLimitConfig>;

/** Rate-limit key for a raw bearer/refresh token without keeping the secret in Redis. */
export function tokenKey(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex").slice(0, 32);
}

/**
 * Check every (identifier, budget) pair and return the first OAuth-shaped 429,
 * or null when all pass. Every pair is counted, so one hot key cannot hide
 * behind another that is still under budget.
 */
export async function mcpRateLimited(
  checks: ReadonlyArray<readonly [identifier: string, config: RateLimitConfig]>,
): Promise<NextResponse | null> {
  const results = await Promise.all(
    checks.map(([identifier, config]) => checkRateLimit(identifier, config)),
  );
  const blocked = results.find((result) => !result.allowed);
  if (!blocked) return null;

  const retryAfter = Math.max(1, Math.ceil((blocked.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "rate_limited", error_description: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}
