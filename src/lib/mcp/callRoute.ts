import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import type { UserRole } from "@/types/user";
import { getAppBaseUrl } from "./baseUrl";

export interface McpCallCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/**
 * A stable per-user address in the IPv6 documentation range (2001:db8::/32,
 * never routable). Reused handlers rate-limit by client IP; a synthetic
 * request has none, so without this every MCP user landed in one shared
 * "direct" bucket and one busy connection throttled search for everybody.
 */
function syntheticClientIp(userId: string): string {
  const hex = crypto.createHash("sha256").update(`mcp:${userId}`).digest("hex");
  const groups = hex.slice(0, 24).match(/.{4}/g) ?? [];
  return ["2001", "db8", ...groups].join(":");
}

/**
 * Invokes an existing route handler (the same one the dashboard's fetch calls
 * hit) with a synthetic NextRequest, so every MCP tool reuses the exact same
 * query-scoping / RBAC / population logic instead of re-implementing it.
 *
 * Handlers normally run inside withAuth's catch; called directly they do not,
 * so a thrown error is caught here and never reaches the AI client verbatim.
 */
export async function callRoute<Ctx extends McpCallCtx>(
  handler: (req: NextRequest, ctx: Ctx, params?: Record<string, string>) => Promise<NextResponse>,
  ctx: Ctx,
  opts: {
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    params?: Record<string, string>;
  }
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const url = new URL(opts.path, getAppBaseUrl());
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const clientIp = syntheticClientIp(ctx.userId);
  const req = new NextRequest(url, {
    headers: { "x-forwarded-for": clientIp, "cf-connecting-ip": clientIp },
  });
  try {
    const res = await handler(req, ctx, opts.params);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    // validateBody() and friends throw a NextResponse for expected failures.
    if (err instanceof NextResponse) {
      const body = await err.json().catch(() => ({}));
      return { ok: false, status: err.status, body };
    }
    logger.error({ err, path: opts.path }, "[mcp] tool handler threw");
    return { ok: false, status: 500, body: { error: "Something went wrong. Try again later." } };
  }
}
