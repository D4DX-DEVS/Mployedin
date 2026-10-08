/**
 * GET /api/insights — AI Data Access index: endpoints + links to schema/openapi.
 * Auth: platform API key (mpi_…) or admin session. Read-only.
 */
import { NextResponse } from "next/server";
import { withInsightsKey } from "@/lib/insights/auth";
import { buildIndex } from "@/lib/insights/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withInsightsKey(async () => NextResponse.json(buildIndex()));
