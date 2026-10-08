import mongoose from "mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import { badRequest } from "./errors";
import type { EntityDef, FilterDef, InsightsAccess, ListParams } from "./types";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** Parameters every list endpoint understands; everything else must be a declared filter. */
const RESERVED = new Set(["page", "limit", "cursor", "from", "to", "sort", "fields", "q"]);

export function parseDate(raw: string | null | undefined, name: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw badRequest("invalid_date", `${name} must be an ISO 8601 date`);
  return d;
}

export function parseIntParam(
  raw: string | null | undefined,
  name: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw badRequest("invalid_param", `${name} must be an integer ≥ ${min}`);
  return Math.min(n, max);
}

export function parseObjectId(raw: string, name = "id"): mongoose.Types.ObjectId {
  if (!/^[a-f\d]{24}$/i.test(raw)) throw badRequest("invalid_id", `${name} must be a 24-hex ObjectId`);
  return new mongoose.Types.ObjectId(raw);
}

/** Generic list params + entity filters, from a URLSearchParams or a plain object (MCP). */
export function parseListParams(
  input: URLSearchParams | Record<string, unknown>,
  entity: EntityDef,
): ListParams {
  const get = (k: string): string | undefined => {
    if (input instanceof URLSearchParams) return input.get(k) ?? undefined;
    const v = input[k];
    return v === undefined || v === null ? undefined : String(v);
  };
  const keys = input instanceof URLSearchParams ? [...new Set(input.keys())] : Object.keys(input);

  const filters: Record<string, string> = {};
  const declared = new Set(entity.filters.map((fd) => fd.param));
  for (const k of keys) {
    if (RESERVED.has(k)) continue;
    if (!declared.has(k)) {
      throw badRequest(
        "unknown_filter",
        `Unknown parameter "${k}" for ${entity.key}. Allowed filters: ${[...declared].join(", ") || "none"}`,
      );
    }
    const v = get(k);
    if (v !== undefined && v !== "") filters[k] = v;
  }

  const fieldsRaw = get("fields");
  const fields = fieldsRaw ? fieldsRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  if (fields) {
    const known = new Set(entity.fields.map((fd) => fd.name));
    const bad = fields.filter((name) => !known.has(name));
    if (bad.length) throw badRequest("invalid_field", `Unknown field(s) for ${entity.key}: ${bad.join(", ")}`);
  }

  const sort = get("sort");
  if (sort) {
    const field = sort.replace(/^[-+]/, "");
    if (!entity.sortable.includes(field)) {
      throw badRequest("invalid_sort", `sort must be one of ${entity.sortable.join(", ")} (prefix - for descending)`);
    }
  }

  const cursor = get("cursor");
  if (cursor && cursor !== "start" && !/^[a-f\d]{24}$/i.test(cursor)) {
    throw badRequest("invalid_cursor", "cursor must be \"start\" or a nextCursor value");
  }

  const q = get("q")?.trim();
  if (q && q.length > 200) throw badRequest("invalid_param", "q must be ≤ 200 characters");

  return {
    page: parseIntParam(get("page"), "page", { min: 1, max: 100_000, fallback: 1 }),
    limit: parseIntParam(get("limit"), "limit", { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT }),
    cursor: cursor || undefined,
    from: parseDate(get("from"), "from"),
    to: parseDate(get("to"), "to"),
    sort: sort || undefined,
    fields,
    q: q || undefined,
    filters,
  };
}

function coerce(fd: FilterDef, raw: string): unknown {
  if (fd.valueMap) {
    if (!(raw in fd.valueMap)) {
      throw badRequest("invalid_filter", `${fd.param} must be one of ${Object.keys(fd.valueMap).join(", ")}`);
    }
    return fd.valueMap[raw];
  }
  switch (fd.type) {
    case "objectId":
      return parseObjectId(raw, fd.param);
    case "boolean":
      if (raw !== "true" && raw !== "false") throw badRequest("invalid_filter", `${fd.param} must be true or false`);
      return raw === "true";
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw badRequest("invalid_filter", `${fd.param} must be a number`);
      return n;
    }
    default:
      if (raw.length > 200) throw badRequest("invalid_filter", `${fd.param} is too long`);
      return raw;
  }
}

/**
 * Build a Mongo condition for one filter value. Only fixed operators are ever
 * produced here — callers cannot inject `$where`, `$expr`, etc. `a|b` means
 * "either value" for eq/ieq filters.
 */
export function filterCondition(fd: FilterDef, raw: string): unknown {
  const op = fd.op ?? "eq";
  const values = op === "eq" || op === "ieq" ? raw.split("|").slice(0, 20) : [raw];
  const parsed = values.map((v) => coerce(fd, v.trim()));

  switch (op) {
    case "ieq": {
      const regexes = parsed.map((v) => new RegExp(`^${escapeRegex(String(v))}$`, "i"));
      return regexes.length === 1 ? regexes[0] : { $in: regexes };
    }
    case "gte":
      return { $gte: parsed[0] };
    case "lte":
      return { $lte: parsed[0] };
    case "regex":
      return { $regex: escapeRegex(String(parsed[0])), $options: "i" };
    case "prefix":
      return { $regex: `^${escapeRegex(String(parsed[0]))}` };
    default:
      return parsed.length === 1 ? parsed[0] : { $in: parsed };
  }
}

/** Compose the full Mongo filter: base + declared filters + date range + q. */
export function buildFilter(
  entity: EntityDef,
  params: Pick<ListParams, "filters" | "from" | "to" | "q">,
  access: InsightsAccess,
): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (entity.baseFilter) and.push(entity.baseFilter);

  for (const [param, raw] of Object.entries(params.filters)) {
    const fd = entity.filters.find((x) => x.param === param);
    if (!fd) throw badRequest("unknown_filter", `Unknown filter "${param}"`);
    if (fd.pii && !access.pii) {
      throw badRequest("pii_scope_required", `Filter "${param}" requires the pii:read scope`);
    }
    and.push({ [fd.path]: filterCondition(fd, raw) });
  }

  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) range.$gte = params.from;
    if (params.to) range.$lte = params.to;
    and.push({ [entity.dateField]: range });
  }

  if (params.q) {
    const paths = (entity.searchFields ?? []).filter((s) => !s.pii || access.pii).map((s) => s.path);
    if (paths.length === 0) {
      throw badRequest("search_unavailable", `q is not supported for ${entity.key}${entity.searchFields?.length ? " without pii:read" : ""}`);
    }
    const rx = { $regex: escapeRegex(params.q), $options: "i" };
    and.push({ $or: paths.map((p) => ({ [p]: rx })) });
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0]!;
  return { $and: and };
}
