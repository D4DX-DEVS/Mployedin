/**
 * GET /api/insights/{entity}/{id} — one record with every declared field.
 */
import { NextResponse } from "next/server";
import { withInsightsKey } from "@/lib/insights/auth";
import { getEntity } from "@/lib/insights/entities";
import { getEntityRecord } from "@/lib/insights/list";
import { insightsErrorResponse } from "@/lib/insights/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withInsightsKey(async (req, ctx, params) => {
  const entity = getEntity(params.entity);
  if (!entity) return insightsErrorResponse(404, "unknown_entity", `Unknown entity "${params.entity}". See /api/insights/schema`);
  const fieldsRaw = req.nextUrl.searchParams.get("fields");
  const fields = fieldsRaw ? fieldsRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  if (fields) {
    const known = new Set(entity.fields.map((f) => f.name));
    const bad = fields.filter((f) => !known.has(f));
    if (bad.length) return insightsErrorResponse(400, "invalid_field", `Unknown field(s): ${bad.join(", ")}`);
  }
  const data = await getEntityRecord(entity, params.id ?? "", { pii: ctx.pii }, fields);
  return NextResponse.json({ data });
});
