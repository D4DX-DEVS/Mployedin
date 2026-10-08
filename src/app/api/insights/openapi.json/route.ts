/**
 * GET /api/insights/openapi.json — OpenAPI 3.1 for the AI Data Access API
 * (import into ChatGPT custom GPT Actions, n8n, Postman…).
 *
 * Public on purpose: it describes the surface, returns no data, and GPT Action
 * importers fetch it without credentials. Every data endpoint still requires a key.
 */
import { NextResponse } from "next/server";
import { buildOpenApi } from "@/lib/insights/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildOpenApi(), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
