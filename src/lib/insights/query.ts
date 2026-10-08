/**
 * Safe aggregation builder for /api/insights/query and the insights_query MCP tool.
 *
 * The caller never supplies Mongo syntax. They pick an entity, up to two
 * `groupBy` paths from that entity's whitelist (or a date bucket such as
 * `createdAt:month`), a metric (`count`, or sum/avg/min/max over a whitelisted
 * numeric path) and filters from the entity's declared filter params. The
 * pipeline is assembled here from fixed stages only.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import { getEntity } from "./entities";
import { badRequest } from "./errors";
import { buildFilter, parseIntParam } from "./params";
import { maskValue } from "./redact";
import type { EntityDef, InsightsAccess } from "./types";

export const QUERY_METRIC_OPS = ["sum", "avg", "min", "max"] as const;
const DATE_UNITS = ["day", "week", "month", "year"] as const;
type DateUnit = (typeof DATE_UNITS)[number];

/** Groupable paths that hold arrays — each element becomes its own group. */
const ARRAY_PATHS = new Set(["skills", "preferredCountries", "requirements.skills"]);

export interface QueryInput {
  entity: string;
  groupBy?: string | string[];
  metric?: string;
  filters?: string | Record<string, string>;
  from?: Date;
  to?: Date;
  limit?: number | string;
  labels?: boolean;
}

interface GroupSpec {
  path: string;
  alias: string;
  unit?: DateUnit;
}

function parseGroupBy(entity: EntityDef, raw: QueryInput["groupBy"]): GroupSpec[] {
  const list = (Array.isArray(raw) ? raw : (raw ?? "").split(",")).map((s) => s.trim()).filter(Boolean);
  if (list.length > 2) throw badRequest("invalid_group_by", "groupBy accepts at most 2 fields");
  const dateFields = new Set([entity.dateField, "createdAt"]);
  return list.map((g) => {
    const [path, unit] = g.split(":");
    if (unit !== undefined) {
      if (!dateFields.has(path!) || !DATE_UNITS.includes(unit as DateUnit)) {
        throw badRequest(
          "invalid_group_by",
          `Date grouping must be ${[...dateFields].map((d) => `${d}:day|week|month|year`).join(" or ")}`,
        );
      }
      return { path: path!, alias: `${path}_${unit}`, unit: unit as DateUnit };
    }
    if (!entity.groupable.includes(path!)) {
      throw badRequest(
        "invalid_group_by",
        `Cannot group ${entity.key} by "${path}". Allowed: ${entity.groupable.join(", ")}, ${[...dateFields].map((d) => `${d}:month`).join(", ")}`,
      );
    }
    return { path: path!, alias: path!.replace(/\./g, "_") };
  });
}

function parseMetric(entity: EntityDef, raw: string | undefined): { op: "count" | (typeof QUERY_METRIC_OPS)[number]; field?: string } {
  if (!raw || raw === "count") return { op: "count" };
  const [op, field] = raw.split(":");
  if (!QUERY_METRIC_OPS.includes(op as (typeof QUERY_METRIC_OPS)[number]) || !field) {
    throw badRequest("invalid_metric", "metric must be count or sum|avg|min|max:<numeric field>");
  }
  if (!entity.numeric.includes(field)) {
    throw badRequest(
      "invalid_metric",
      `"${field}" is not a numeric field of ${entity.key}. Allowed: ${entity.numeric.join(", ") || "none (use count)"}`,
    );
  }
  return { op: op as (typeof QUERY_METRIC_OPS)[number], field };
}

/** `status:active|paused,country:UAE` → { status: "active|paused", country: "UAE" } */
export function parseFilterString(raw: QueryInput["filters"]): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === "object") {
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  }
  const out: Record<string, string> = {};
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const idx = part.indexOf(":");
    if (idx <= 0) throw badRequest("invalid_filter", `filters must look like field:value[,field:value] — got "${part}"`);
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

async function resolveLabels(
  path: string,
  ids: string[],
  access: InsightsAccess,
): Promise<Map<string, string> | null> {
  const oids = ids.filter((id) => /^[a-f\d]{24}$/i.test(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (oids.length === 0) return null;
  const pick = async (
    model: unknown,
    field: string,
    idList = oids,
  ): Promise<Map<string, string>> => {
    const rows = await (model as mongoose.Model<Record<string, unknown>>)
      .find({ _id: { $in: idList } })
      .select(field)
      .lean<Record<string, unknown>[]>();
    return new Map(rows.map((r) => [String(r._id), String(r[field] ?? "")]));
  };
  const userNames = async (model: unknown) => {
    const rows = await (model as mongoose.Model<Record<string, unknown>>)
      .find({ _id: { $in: oids } })
      .select("userId")
      .lean<{ _id: unknown; userId?: unknown }[]>();
    const names = await pick(User, "name", rows.map((r) => r.userId).filter(Boolean) as mongoose.Types.ObjectId[]);
    return new Map(rows.map((r) => [String(r._id), names.get(String(r.userId)) ?? ""]));
  };
  const mask = (map: Map<string, string>) =>
    access.pii ? map : new Map([...map].map(([k, v]) => [k, String(maskValue("name", v))]));

  switch (path) {
    case "employerId":
      return pick(Employer, "companyName");
    case "jobId":
      return pick(Job, "title");
    case "planId":
      return pick(SubscriptionPlan, "name");
    case "agentId":
      return mask(await userNames(Agent));
    case "superAgentId":
      return mask(await userNames(SuperAgent));
    case "userId":
    case "actorId":
      return mask(await pick(User, "name"));
    default:
      return null;
  }
}

export async function runQuery(input: QueryInput, access: InsightsAccess) {
  const entity = getEntity(input.entity);
  if (!entity) throw badRequest("invalid_entity", `entity must be one of the /api/insights entity keys`);

  const groups = parseGroupBy(entity, input.groupBy);
  const metric = parseMetric(entity, input.metric);
  const filters = parseFilterString(input.filters);
  const limit = parseIntParam(input.limit === undefined ? undefined : String(input.limit), "limit", {
    min: 1,
    max: 200,
    fallback: 50,
  });
  const match = buildFilter(entity, { filters, from: input.from, to: input.to }, access);

  const pipeline: Record<string, unknown>[] = [{ $match: match }];
  for (const g of groups) if (ARRAY_PATHS.has(g.path)) pipeline.push({ $unwind: `$${g.path}` });

  const groupId: Record<string, unknown> = {};
  for (const g of groups) {
    groupId[g.alias] = g.unit
      ? { $dateTrunc: { date: `$${g.path}`, unit: g.unit, startOfWeek: "monday", timezone: "UTC" } }
      : `$${g.path}`;
  }
  const valueExpr =
    metric.op === "count" ? { $sum: 1 } : { [`$${metric.op}`]: { $ifNull: [`$${metric.field}`, metric.op === "sum" ? 0 : null] } };

  const hasDateGroup = groups.some((g) => g.unit);
  pipeline.push(
    { $group: { _id: groups.length ? groupId : null, value: valueExpr, records: { $sum: 1 } } },
    { $sort: hasDateGroup ? { _id: 1 } : { value: -1 } },
    { $limit: limit + 1 },
  );

  await connectDB();
  const rows = await entity
    .model()
    .aggregate<{ _id: Record<string, unknown> | null; value: number | null; records: number }>(
      pipeline as unknown as mongoose.PipelineStage[],
    )
    .option({ maxTimeMS: 15_000 });

  const truncated = rows.length > limit;
  const kept = rows.slice(0, limit);

  const toKey = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (v && typeof v === "object" && "_bsontype" in (v as object)) return String(v);
    return v ?? null;
  };

  const data = kept.map((r) => {
    const row: Record<string, unknown> = {};
    for (const g of groups) row[g.alias] = toKey(r._id?.[g.alias]);
    row.value = typeof r.value === "number" ? Math.round(r.value * 100) / 100 : r.value;
    row.records = r.records;
    return row;
  });

  if (input.labels) {
    for (const g of groups) {
      if (g.unit) continue;
      const ids = data.map((d) => d[g.alias]).filter((v): v is string => typeof v === "string");
      const labels = await resolveLabels(g.path, ids, access);
      if (labels) for (const d of data) d[`${g.alias}_label`] = labels.get(String(d[g.alias])) ?? null;
    }
  }

  return {
    entity: entity.key,
    groupBy: groups.map((g) => (g.unit ? `${g.path}:${g.unit}` : g.path)),
    metric: metric.op === "count" ? "count" : `${metric.op}:${metric.field}`,
    filters,
    from: input.from?.toISOString() ?? null,
    to: input.to?.toISOString() ?? null,
    dateField: entity.dateField,
    truncated,
    data,
  };
}
