import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import { getPath } from "./entities";
import { InsightsError, badRequest } from "./errors";
import { buildFilter, parseObjectId } from "./params";
import { maskValue, sanitizeOutput } from "./redact";
import type { EntityDef, FieldDef, InsightsAccess, ListParams, ListResult } from "./types";

type Doc = Record<string, unknown>;

/** Fields to return: explicit `fields=` list, else all non-detailOnly (or all in detail mode). */
function selectFields(entity: EntityDef, requested: string[] | undefined, detail: boolean): FieldDef[] {
  if (requested?.length) {
    const wanted = new Set(["_id", ...requested]);
    return entity.fields.filter((fd) => wanted.has(fd.name));
  }
  return entity.fields.filter((fd) => detail || !fd.detailOnly);
}

function projectionFor(entity: EntityDef, fields: FieldDef[]): Record<string, 1> {
  const proj: Record<string, 1> = { _id: 1 };
  for (const fd of fields) for (const p of fd.src ?? [fd.name]) proj[p] = 1;
  if (entity.joinUser) proj.userId = 1;
  // Collapse paths that are prefixes of each other ("cv" + "cv.atsScore" → path collision error in Mongo).
  const keys = Object.keys(proj).sort();
  for (const k of keys) {
    if (keys.some((other) => other !== k && k.startsWith(`${other}.`))) delete proj[k];
  }
  return proj;
}

function shape(doc: Doc, fields: FieldDef[], access: InsightsAccess): Doc {
  const out: Doc = {};
  for (const fd of fields) {
    let value = fd.compute ? fd.compute(doc) : getPath(doc, fd.name);
    if (value === undefined) value = null;
    if (fd.pii && !access.pii && value !== null && (typeof value === "string" || typeof value === "number")) {
      value = maskValue(fd.pii, value);
    }
    out[fd.name] = value;
  }
  return sanitizeOutput(out, access.pii) as Doc;
}

async function attachUsers(docs: Doc[]): Promise<void> {
  const ids = [...new Set(docs.map((d) => d.userId).filter(Boolean).map(String))];
  if (ids.length === 0) return;
  const users = await User.find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select("name email phone isActive lastLogin")
    .lean<{ _id: mongoose.Types.ObjectId; name?: string; email?: string; phone?: string; isActive?: boolean; lastLogin?: Date }[]>();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  for (const d of docs) {
    const u = byId.get(String(d.userId));
    d.user = u
      ? { name: u.name ?? null, email: u.email ?? null, phone: u.phone ?? null, isActive: u.isActive ?? null, lastLogin: u.lastLogin ?? null }
      : null;
  }
}

function sortSpec(entity: EntityDef, sort: string | undefined): Record<string, 1 | -1> {
  if (!sort) return { [entity.dateField]: -1, _id: -1 };
  const desc = sort.startsWith("-");
  const field = sort.replace(/^[-+]/, "");
  return { [field]: desc ? -1 : 1, _id: desc ? -1 : 1 };
}

/**
 * List records of one entity. Offset pagination by default (`page`); keyset
 * pagination on `_id` descending when `cursor` is sent (`cursor=start`, then
 * the returned `nextCursor`) — stable for full exports of large collections.
 */
export async function listEntity(entity: EntityDef, params: ListParams, access: InsightsAccess): Promise<ListResult> {
  await connectDB();
  const fields = selectFields(entity, params.fields, false);
  const filter = buildFilter(entity, params, access);
  const model = entity.model();
  const cursorMode = Boolean(params.cursor);

  if (cursorMode && params.sort) {
    throw badRequest("invalid_sort", "sort cannot be combined with cursor (cursor pages are ordered by _id descending)");
  }

  const pageFilter =
    cursorMode && params.cursor !== "start"
      ? { $and: [filter, { _id: { $lt: parseObjectId(params.cursor!, "cursor") } }] }
      : filter;

  let query = model
    .find(pageFilter)
    .select(projectionFor(entity, fields))
    .sort(cursorMode ? { _id: -1 } : sortSpec(entity, params.sort))
    .limit(params.limit);
  if (!cursorMode) query = query.skip((params.page - 1) * params.limit);

  const [rows, total] = await Promise.all([
    query.lean<Doc[]>().maxTimeMS(15_000),
    model.countDocuments(filter).maxTimeMS(15_000),
  ]);

  if (entity.joinUser) await attachUsers(rows);

  const data = rows.map((row) => shape(row, fields, access));
  const result: ListResult = { data, page: cursorMode ? 1 : params.page, limit: params.limit, total };
  if (cursorMode) {
    result.nextCursor = rows.length === params.limit ? String(rows[rows.length - 1]!._id) : null;
  }
  return result;
}

/** One record by id, with every declared field (including detailOnly ones). */
export async function getEntityRecord(
  entity: EntityDef,
  id: string,
  access: InsightsAccess,
  requestedFields?: string[],
): Promise<Doc> {
  await connectDB();
  const _id = parseObjectId(id);
  const fields = selectFields(entity, requestedFields, true);
  const filter = entity.baseFilter ? { $and: [entity.baseFilter, { _id }] } : { _id };
  const row = await entity
    .model()
    .findOne(filter)
    .select(projectionFor(entity, fields))
    .lean<Doc>()
    .maxTimeMS(15_000);
  if (!row) throw new InsightsError(404, "not_found", `${entity.label} ${id} not found`);
  if (entity.joinUser) await attachUsers([row]);
  return shape(row, fields, access);
}
