/**
 * GET /api/insights/timeseries?metric=&interval=day|week|month&from=&to=&currency=
 * → { metric, interval, from, to, total, points: [{ t, value }] }
 */
import { NextResponse } from "next/server";
import { withInsightsKey } from "@/lib/insights/auth";
import { getTimeseries } from "@/lib/insights/timeseries";
import { parseDate } from "@/lib/insights/params";
import { insightsErrorResponse } from "@/lib/insights/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withInsightsKey(async (req) => {
  const sp = req.nextUrl.searchParams;
  const metric = sp.get("metric");
  if (!metric) return insightsErrorResponse(400, "invalid_metric", "metric is required");
  const result = await getTimeseries({
    metric,
    interval: sp.get("interval") ?? undefined,
    from: parseDate(sp.get("from"), "from"),
    to: parseDate(sp.get("to"), "to"),
    currency: sp.get("currency") ?? undefined,
  });
  return NextResponse.json(result);
});
