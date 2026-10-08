/**
 * GET /api/insights/search?q= — top 10 jobs, employers, leads (and users with pii:read).
 */
import { NextResponse } from "next/server";
import { withInsightsKey } from "@/lib/insights/auth";
import { searchAll } from "@/lib/insights/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withInsightsKey(async (req, ctx) =>
  NextResponse.json(await searchAll(req.nextUrl.searchParams.get("q"), { pii: ctx.pii })),
);
