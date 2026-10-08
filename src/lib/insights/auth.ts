/**
 * Authentication for the AI Data Access API (/api/insights/*).
 *
 * Two ways in:
 *   1. A platform API key — `Authorization: Bearer mpi_…` or `x-api-key: mpi_…`.
 *      Hash lookup + constant-time compare, active/expiry/scope checks, a
 *      per-key rate limit, usage counters and one audit entry per request.
 *   2. An admin session (via withAuth), so the admin UI's "Try it" works
 *      without minting a key. Rate-limited and audited the same way.
 *
 * Every failure is `{ error, code }` with 401 / 403 / 429.
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";
import PlatformApiKey, {
  PLATFORM_API_KEY_PATTERN,
  hashPlatformApiKey,
  type PlatformApiKeyScope,
} from "@/models/PlatformApiKey";
import { InsightsError, insightsErrorResponse } from "./errors";

export interface InsightsContext {
  via: "api_key" | "admin_session";
  keyId?: string;
  keyPrefix?: string;
  userId?: string;
  scopes: PlatformApiKeyScope[];
  /** Caller may see un-redacted personal data. */
  pii: boolean;
}

type InsightsHandler = (
  req: NextRequest,
  ctx: InsightsContext,
  params: Record<string, string>,
) => Promise<NextResponse>;

type RouteContext = { params: Promise<Record<string, string>> };

/** Admin sessions share the default per-key budget. */
const SESSION_RATE_LIMIT_PER_MIN = 120;

interface KeyRow {
  _id: unknown;
  keyHash: string;
  keyPrefix: string;
  scopes: PlatformApiKeyScope[];
  isActive: boolean;
  expiresAt?: Date | null;
  rateLimitPerMin?: number;
  createdBy?: unknown;
}

/** Pull an mpi_ key from Authorization: Bearer or x-api-key. Returns "" when the caller sent none. */
export function extractApiKey(req: NextRequest): string {
  const header = req.headers.get("x-api-key")?.trim();
  if (header) return header;
  const authz = req.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authz);
  return match ? match[1]!.trim() : "";
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && crypto.timingSafeEqual(ab, bb);
}

function rateHeaders(limit: number, remaining: number, resetAt: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}

function withHeaders(res: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "no-store");
  return res;
}

async function runHandler(
  handler: InsightsHandler,
  req: NextRequest,
  ctx: InsightsContext,
  params: Record<string, string>,
): Promise<NextResponse> {
  try {
    return await handler(req, ctx, params);
  } catch (err) {
    if (err instanceof InsightsError) return insightsErrorResponse(err.status, err.code, err.message);
    if (err instanceof NextResponse) return err;
    logger.error({ err, path: req.nextUrl.pathname }, "[insights] Unhandled error");
    return insightsErrorResponse(500, "internal_error", "Internal server error");
  }
}

function audit(req: NextRequest, ctx: InsightsContext, status: number, actorId?: string) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  // Fire-and-forget: logActivity never throws (non-critical), and a read API
  // should not pay an extra DB round trip of latency per call.
  void logActivity({
    actorId,
    actorRole: ctx.via === "api_key" ? "api_key" : "admin",
    action: "insights.read",
    resource: "insights",
    resourceId: ctx.keyId,
    meta: {
      endpoint: req.nextUrl.pathname,
      query,
      status,
      via: ctx.via,
      keyId: ctx.keyId,
      keyPrefix: ctx.keyPrefix,
      ip: getClientIp(req.headers),
    },
    req,
  });
}

async function viaApiKey(
  handler: InsightsHandler,
  req: NextRequest,
  rawKey: string,
  params: Record<string, string>,
): Promise<NextResponse> {
  if (!PLATFORM_API_KEY_PATTERN.test(rawKey)) {
    return insightsErrorResponse(401, "invalid_key", "Invalid API key");
  }

  await connectDB();
  const hash = hashPlatformApiKey(rawKey);
  const key = await PlatformApiKey.findOne({ keyHash: hash })
    .select("keyHash keyPrefix scopes isActive expiresAt rateLimitPerMin createdBy")
    .lean<KeyRow>();

  if (!key || !safeEqualHex(key.keyHash, hash)) {
    return insightsErrorResponse(401, "invalid_key", "Invalid API key");
  }
  if (!key.isActive) return insightsErrorResponse(403, "key_revoked", "API key has been revoked");
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
    return insightsErrorResponse(403, "key_expired", "API key has expired");
  }
  if (!key.scopes?.includes("insights:read")) {
    return insightsErrorResponse(403, "insufficient_scope", "API key lacks the insights:read scope");
  }

  const keyId = String(key._id);
  const limit = key.rateLimitPerMin ?? 120;
  const rl = await checkRateLimit(keyId, { limit, windowSec: 60, prefix: "rl-insights-key" });
  if (!rl.allowed) {
    return insightsErrorResponse(429, "rate_limited", `Rate limit of ${limit} requests/minute exceeded`, {
      ...rateHeaders(limit, 0, rl.resetAt),
      "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
    });
  }

  PlatformApiKey.updateOne({ _id: keyId }, { $inc: { totalRequests: 1 }, $set: { lastUsedAt: new Date() } })
    .exec()
    .catch((err: unknown) => logger.warn({ err, keyId }, "[insights] usage counter update failed"));

  const ctx: InsightsContext = {
    via: "api_key",
    keyId,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    pii: key.scopes.includes("pii:read"),
  };
  const res = await runHandler(handler, req, ctx, params);
  audit(req, ctx, res.status, key.createdBy ? String(key.createdBy) : undefined);
  return withHeaders(res, rateHeaders(limit, rl.remaining, rl.resetAt));
}

/**
 * Wrap a GET route handler so it accepts a platform API key or an admin session.
 *
 *   export const GET = withInsightsKey(async (req, ctx) => { … });
 */
export function withInsightsKey(handler: InsightsHandler) {
  const sessionRoute = withAuth(
    async (req: NextRequest, auth: AuthContext, params?: Record<string, string>) => {
      if (auth.role !== "admin" || auth.tenantView) {
        return insightsErrorResponse(403, "forbidden", "AI Data Access is limited to admins or platform API keys");
      }
      const rl = await checkRateLimit(`user:${auth.userId}`, {
        limit: SESSION_RATE_LIMIT_PER_MIN,
        windowSec: 60,
        prefix: "rl-insights-session",
      });
      if (!rl.allowed) {
        return insightsErrorResponse(429, "rate_limited", "Rate limit exceeded", {
          ...rateHeaders(SESSION_RATE_LIMIT_PER_MIN, 0, rl.resetAt),
          "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
        });
      }
      const ctx: InsightsContext = {
        via: "admin_session",
        userId: auth.userId,
        scopes: ["insights:read", "pii:read"],
        pii: true,
      };
      const res = await runHandler(handler, req, ctx, params ?? {});
      audit(req, ctx, res.status, auth.userId);
      return withHeaders(res, rateHeaders(SESSION_RATE_LIMIT_PER_MIN, rl.remaining, rl.resetAt));
    },
    { resource: "insights", action: "read", skipTenantView: true },
  );

  return async (req: NextRequest, context: RouteContext): Promise<NextResponse> => {
    const rawKey = extractApiKey(req);
    if (rawKey) {
      const params = (await context.params) ?? {};
      return viaApiKey(handler, req, rawKey, params);
    }

    const res = await sessionRoute(req, context);
    // withAuth's own 401/403 bodies lack a code — normalise them for API clients.
    if (res.status === 401) {
      return insightsErrorResponse(
        401,
        "missing_key",
        "Send an API key: Authorization: Bearer mpi_… or x-api-key header",
      );
    }
    if (res.status === 403) {
      const body = (await res.clone().json().catch(() => ({}))) as { code?: string };
      if (!body.code) return insightsErrorResponse(403, "forbidden", "Insufficient permissions");
    }
    return res;
  };
}
