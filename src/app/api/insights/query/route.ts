/**
 * GET /api/insights/query?entity=&groupBy=&metric=count|sum:<f>|avg:<f>&filters=&from=&to=&limit=&labels=
 * Safe group-by aggregation over whitelisted fields — no Mongo operators accepted.
 */
import { NextResponse } from "next/server";
import { withInsightsKey } from "@/lib/insights/auth";
import { runQuery } from "@/lib/insights/query";
import { parseDate } from "@/lib/insights/params";
import { insightsErrorResponse } from "@/lib/insights/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withInsightsKey(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const entity = sp.get("entity");
  if (!entity) return insightsErrorResponse(400, "invalid_entity", "entity is required");
  const result = await runQuery(
    {
      entity,
      groupBy: sp.get("groupBy") ?? undefined,
      metric: sp.get("metric") ?? undefined,
      filters: sp.get("filters") ?? undefined,
      from: parseDate(sp.get("from"), "from"),
      to: parseDate(sp.get("to"), "to"),
      limit: sp.get("limit") ?? undefined,
      labels: sp.get("labels") === "true" || sp.get("labels") === "1",
    },
    { pii: ctx.pii },
  );
  return NextResponse.json(result);
});
