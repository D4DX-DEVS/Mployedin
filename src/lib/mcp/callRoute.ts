import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/types/user";
import { getAppBaseUrl } from "./baseUrl";

export interface McpCallCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/**
 * Invokes an existing route handler (the same one the dashboard's fetch calls
 * hit) with a synthetic NextRequest, so every MCP tool reuses the exact same
 * query-scoping / RBAC / population logic instead of re-implementing it.
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
  const req = new NextRequest(url);
  const res = await handler(req, ctx, opts.params);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
