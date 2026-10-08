/**
 * GET /api/insights/schema — every endpoint, parameter and returned field with
 * type + meaning. The first call an LLM should make.
 */
import { NextResponse } from "next/server";
import { withInsightsKey } from "@/lib/insights/auth";
import { buildSchema } from "@/lib/insights/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withInsightsKey(async () => NextResponse.json(buildSchema()));
