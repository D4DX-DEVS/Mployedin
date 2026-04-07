/**
 * Centralized activity / audit logging utility.
 *
 * Usage (inside any API route):
 *   import { logActivity } from "@/lib/audit/log";
 *   await logActivity({ ... });
 *
 * All writes go to the AuditLog collection and are visible to admins via
 * GET /api/admin/audit-logs.
 *
 * Country detection uses the following header priority (no external API call):
 *   1. CF-IPCountry  (Cloudflare)
 *   2. X-Vercel-IP-Country  (Vercel Edge)
 *   3. X-Country  (custom proxy)
 */

import { connectDB } from "@/lib/db/mongoose";
import AuditLog from "@/models/AuditLog";
import { NextRequest } from "next/server";

export interface LogActivityParams {
  /** User performing the action (ObjectId string) — omit for system events */
  actorId?: string;
  /** Role of the actor */
  actorRole?: string;
  /** Unique action verb, e.g. "login", "job.create", "application.status_change" */
  action: string;
  /** Resource type — mirrors RBAC resource names */
  resource: string;
  /** ID of the affected resource (optional) */
  resourceId?: string;
  /** Snapshot of changes */
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  /** Arbitrary metadata */
  meta?: Record<string, unknown>;
  /** Originating request — used to extract IP / UA / country */
  req?: NextRequest;
  /** Explicit IP override */
  ipAddress?: string;
  /** Explicit country override (ISO-3166-1 alpha-2) */
  country?: string;
}

/**
 * Derive the best-available IP address from request headers.
 */
function extractIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Derive country code from CDN / proxy headers (no external call).
 * Returns ISO-3166-1 alpha-2 code (e.g. "US") or undefined.
 */
function extractCountry(req: NextRequest): string | undefined {
  const code =
    req.headers.get("cf-ipcountry") ??        // Cloudflare
    req.headers.get("x-vercel-ip-country") ??  // Vercel Edge
    req.headers.get("x-country") ??            // Custom proxy
    undefined;
  // "XX" is Cloudflare's value for unknown — treat as absent
  if (!code || code === "XX") return undefined;
  return code.toUpperCase();
}

/**
 * Write a single audit log entry. Does NOT throw — errors are caught and
 * silently logged to stderr so the calling request is never disrupted.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await connectDB();

    const ip = params.ipAddress ?? (params.req ? extractIp(params.req) : "unknown");
    const country = params.country ?? (params.req ? extractCountry(params.req) : undefined);
    const userAgent = params.req?.headers.get("user-agent") ?? undefined;

    await AuditLog.create({
      actorId: params.actorId ?? undefined,
      actorRole: params.actorRole ?? "system",
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      changes: params.changes,
      meta: params.meta,
      ipAddress: ip,
      country,
      userAgent,
    });
  } catch (err) {
    // Never let logging break the main request
    console.error("[AuditLog] Failed to write entry:", err);
  }
}

/**
 * Convenience: extract common fields from a `withAuth` context object.
 */
export function actorFromCtx(ctx: { userId: string; role: string }) {
  return { actorId: ctx.userId, actorRole: ctx.role };
}
