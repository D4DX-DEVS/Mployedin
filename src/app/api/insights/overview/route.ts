/**
 * GET /api/insights/overview — platform KPIs with 30-day trends.
 */
import { NextResponse } from "next/server";
import { withInsightsKey } from "@/lib/insights/auth";
import { getOverview } from "@/lib/insights/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withInsightsKey(async () => NextResponse.json(await getOverview()));
