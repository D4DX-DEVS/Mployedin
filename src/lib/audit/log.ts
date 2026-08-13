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

import logger from "@/lib/logger";
import { connectDB } from "@/lib/db/mongoose";
import AuditLog from "@/models/AuditLog";
import { NextRequest } from "next/server";

export interface LogActivityParams {
  /** User performing the action (ObjectId string) — omit for system events */
  actorId?: string;
  /** Role of the actor */
  actorRole?: string;
  /** Account the action was performed against, when acting inside someone else's context */
  onBehalfOfId?: string;
  /** Role of that account */
  onBehalfOfRole?: string;
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
  /**
   * Opt in to failing loudly. Default false keeps the historical behaviour (log the
   * error, let the request succeed). Set true only where the audit entry IS the
   * control — entering/leaving someone else's account, settling money, permanent
   * deletion, GDPR erasure — so the action cannot happen untraceably. The caller
   * must be prepared for logActivity to throw.
   */
  critical?: boolean;
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
 * Write a single audit log entry. Does NOT throw by default — errors are caught and
 * logged so the calling request is never disrupted. Pass `critical: true` to invert
 * that for actions where an untraceable success is unacceptable.
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
      onBehalfOfId: params.onBehalfOfId ?? undefined,
      onBehalfOfRole: params.onBehalfOfRole ?? undefined,
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
    // Never let logging break the main request — unless the caller declared the
    // action accountability-critical, in which case losing the trail is worse than
    // failing the request (see below).
    //
    // `event: "audit_write_failed"` is a stable field to alert on. Without an alert
    // this only ever reached stderr, so a privileged action could succeed with no
    // trace and nobody would know: the entry is the only control behind
    // impersonation, commission settlement, permanent deletes and GDPR erasure.
    logger.error(
      {
        err,
        event: "audit_write_failed",
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        actorId: params.actorId,
        critical: params.critical ?? false,
      },
      "[AuditLog] Failed to write entry"
    );
    if (params.critical) throw err;
  }
}

/**
 * Convenience: extract common fields from a `withAuth` context object.
 */
export function actorFromCtx(ctx: {
  userId: string;
  role: string;
  tenantView?: { actorId: string; actorRole: string; employerId: string };
}) {
  // During tenant view / impersonation, withAuth swaps ctx.userId and ctx.role to the
  // target so that employer-scoped lookups work transparently. Attributing the audit
  // entry to those would credit the action to the employer, hiding which admin,
  // super-agent or agent actually performed it. Keep the real human as the actor and
  // record the account they were acting against separately.
  if (ctx.tenantView) {
    return {
      actorId: ctx.tenantView.actorId,
      actorRole: ctx.tenantView.actorRole,
      onBehalfOfId: ctx.userId,
      onBehalfOfRole: ctx.role,
    };
  }
  return { actorId: ctx.userId, actorRole: ctx.role };
}
