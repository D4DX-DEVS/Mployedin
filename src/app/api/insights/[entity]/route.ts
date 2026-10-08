/**
 * GET /api/insights/{entity} — paginated, filtered, redacted list of one entity
 * (users, employers, job-seekers, agents, super-agents, jobs, applications,
 * interviews, offers, placements, commissions, invoices, subscriptions, leads,
 * audit-logs). → { data, page, limit, total, nextCursor? }
 */
import { NextResponse } from "next/server";
import { withInsightsKey } from "@/lib/insights/auth";
import { getEntity } from "@/lib/insights/entities";
import { listEntity } from "@/lib/insights/list";
import { parseListParams } from "@/lib/insights/params";
import { insightsErrorResponse } from "@/lib/insights/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withInsightsKey(async (req, ctx, params) => {
  const entity = getEntity(params.entity);
  if (!entity) return insightsErrorResponse(404, "unknown_entity", `Unknown entity "${params.entity}". See /api/insights/schema`);
  const listParams = parseListParams(req.nextUrl.searchParams, entity);
  return NextResponse.json(await listEntity(entity, listParams, { pii: ctx.pii }));
});
