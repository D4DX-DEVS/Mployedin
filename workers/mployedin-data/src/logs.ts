/**
 * Log writes and reads against D1. Everything a request names (table, column,
 * filter, group) is checked against src/tables.ts before SQL is built; values
 * only ever travel as bound parameters.
 */

import type { D1Database, D1PreparedStatement, Env } from "./types";
import { tableSpec, type TableSpec } from "./tables";

export class BadRequest extends Error {}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT = 64 * 1024;
const MAX_JSON = 64 * 1024;
export const MAX_BATCH_ROWS = 500;
const PAGE_SIZES = new Set([10, 20, 50, 100]);
const MAX_OFFSET = 100_000;
const MAX_FILTER_VALUES = 20;
const MAX_FILTER_BINDS = 90;

type SqlValue = string | number | null;

/** One write: `upsert` a whole row (default), or `update` mutable columns of rows matched by id / updateBy. */
export interface LogWrite {
  table: string;
  op?: "upsert" | "update";
  row: Record<string, unknown>;
  /** update only: exactly one of id / the table's updateBy columns. */
  where?: Record<string, unknown>;
  /**
   * update only: also require one mutable column to hold one of these values
   * (1-20). A WhatsApp receipt only moves status forward: { status: ["sent"] }
   * keeps a late "delivered" from overwriting "read".
   */
  onlyIf?: Record<string, unknown>;
}

function encodeValue(spec: TableSpec, column: string, value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  switch (spec.columns[column]) {
    case "text":
      if (typeof value !== "string") throw new BadRequest(`${column} must be a string`);
      if (value.length > MAX_TEXT) throw new BadRequest(`${column} is too long`);
      return value;
    case "int":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new BadRequest(`${column} must be an integer`);
      return value;
    case "bool":
      if (typeof value !== "boolean") throw new BadRequest(`${column} must be true or false`);
      return value ? 1 : 0;
    case "json": {
      const text = JSON.stringify(value);
      if (text === undefined) throw new BadRequest(`${column} is not JSON`);
      if (text.length > MAX_JSON) throw new BadRequest(`${column} is too large`);
      return text;
    }
    default:
      throw new BadRequest(`unknown column ${column}`);
  }
}

function specOf(table: unknown): TableSpec {
  const spec = typeof table === "string" ? tableSpec(table) : undefined;
  if (!spec) throw new BadRequest(`unknown table ${String(table)}`);
  return spec;
}

function updateGuard(spec: TableSpec, onlyIf: unknown): { sql: string; values: SqlValue[] } {
  if (onlyIf === undefined) return { sql: "", values: [] };
  if (!onlyIf || typeof onlyIf !== "object" || Array.isArray(onlyIf)) throw new BadRequest("onlyIf must be an object");
  const keys = Object.keys(onlyIf);
  if (keys.length !== 1 || !spec.mutable.includes(keys[0])) {
    throw new BadRequest(`onlyIf takes one of: ${spec.mutable.join(", ") || "(none)"}`);
  }
  const list = (onlyIf as Record<string, unknown>)[keys[0]];
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_FILTER_VALUES) {
    throw new BadRequest(`onlyIf.${keys[0]}: 1-${MAX_FILTER_VALUES} values`);
  }
  const values = list.map((v) => encodeValue(spec, keys[0], v));
  if (values.includes(null)) throw new BadRequest(`onlyIf.${keys[0]} values cannot be empty`);
  return { sql: ` AND ${keys[0]} IN (${values.map(() => "?").join(", ")})`, values };
}

/** The SQL statement for one write, validated. Exported for tests. */
export function buildWrite(db: D1Database, write: LogWrite): D1PreparedStatement {
  const spec = specOf(write.table);
  const row = write.row;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new BadRequest("row must be an object");
  for (const column of Object.keys(row)) {
    // Own keys only: `in` would also accept "constructor", "toString"...
    if (!Object.prototype.hasOwnProperty.call(spec.columns, column)) {
      throw new BadRequest(`${write.table} has no column ${column}`);
    }
  }

  if ((write.op ?? "upsert") === "update") {
    const where = write.where ?? {};
    const keys = Object.keys(where);
    if (keys.length !== 1 || !(keys[0] === "id" || spec.updateBy.includes(keys[0]))) {
      throw new BadRequest(`update needs exactly one of: ${["id", ...spec.updateBy].join(", ")}`);
    }
    const sets = Object.keys(row);
    if (sets.length === 0) throw new BadRequest("update has nothing to set");
    const notMutable = sets.filter((c) => !spec.mutable.includes(c));
    if (notMutable.length) throw new BadRequest(`${write.table} cannot update ${notMutable.join(", ")}`);
    const matchValue = encodeValue(spec, keys[0], where[keys[0]]);
    if (matchValue === null) throw new BadRequest("update match value is empty");
    const guard = updateGuard(spec, write.onlyIf);
    return db
      .prepare(`UPDATE ${write.table} SET ${sets.map((c) => `${c} = ?`).join(", ")} WHERE ${keys[0]} = ?${guard.sql}`)
      .bind(...sets.map((c) => encodeValue(spec, c, row[c])), matchValue, ...guard.values);
  }

  if (typeof row.id !== "string" || !ID_PATTERN.test(row.id)) throw new BadRequest("id must be 1-64 letters, digits, - or _");
  if (typeof row.created_at !== "number") throw new BadRequest("created_at is required");
  const missing = spec.required.filter((c) => row[c] === undefined || row[c] === null);
  if (missing.length) throw new BadRequest(`${write.table} needs ${missing.join(", ")}`);

  const columns = Object.keys(row).filter((c) => row[c] !== undefined);
  const updatable = columns.filter((c) => spec.mutable.includes(c));
  const conflict = updatable.length
    ? `DO UPDATE SET ${updatable.map((c) => `${c} = excluded.${c}`).join(", ")}`
    : "DO NOTHING";
  return db
    .prepare(
      `INSERT INTO ${write.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT(id) ${conflict}`,
    )
    .bind(...columns.map((c) => encodeValue(spec, c, row[c])));
}

/**
 * Validates every write first (nothing is written if one is bad), then one
 * atomic batch per database. `unmatched` lists the positions of `update` writes
 * that changed no row: a delivery receipt that arrived before the row it
 * updates. The caller retries those later instead of losing the status.
 */
export async function writeLogs(env: Env, writes: unknown): Promise<{ written: number; unmatched: number[] }> {
  if (!Array.isArray(writes) || writes.length === 0) throw new BadRequest("rows must be a non-empty array");
  if (writes.length > MAX_BATCH_ROWS) throw new BadRequest(`at most ${MAX_BATCH_ROWS} rows per request`);

  const byDb = new Map<TableSpec["db"], Array<{ position: number; isUpdate: boolean; statement: D1PreparedStatement }>>();
  (writes as LogWrite[]).forEach((write, position) => {
    const spec = specOf(write?.table);
    const entries = byDb.get(spec.db) ?? [];
    entries.push({ position, isUpdate: write.op === "update", statement: buildWrite(env[spec.db], write) });
    byDb.set(spec.db, entries);
  });

  const unmatched: number[] = [];
  for (const [db, entries] of byDb) {
    const results = await env[db].batch(entries.map((e) => e.statement));
    entries.forEach((e, i) => {
      if (e.isUpdate && (results[i]?.meta.changes ?? 0) === 0) unmatched.push(e.position);
    });
  }
  return { written: writes.length - unmatched.length, unmatched: unmatched.sort((a, b) => a - b) };
}

interface ReadFilters {
  where: string[];
  params: SqlValue[];
}

function readFilters(spec: TableSpec, params: URLSearchParams): ReadFilters {
  const where: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, raw] of params) {
    if (["page", "pageSize", "from", "to", "groupBy"].includes(key)) continue;
    if (!spec.filters.includes(key)) throw new BadRequest(`cannot filter by ${key}`);
    if (where.some((clause) => clause.startsWith(`${key} `))) throw new BadRequest(`${key} given twice`);
    const list = raw.split(",").map((v) => v.trim()).filter(Boolean);
    if (list.length === 0 || list.length > MAX_FILTER_VALUES) throw new BadRequest(`${key}: 1-${MAX_FILTER_VALUES} values`);
    const encoded = list.map((v) => (spec.columns[key] === "int" ? Number(v) : v));
    if (encoded.some((v) => typeof v === "number" && !Number.isSafeInteger(v))) throw new BadRequest(`${key} must be an integer`);
    if (encoded.some((v) => typeof v === "string" && v.length > 200)) throw new BadRequest(`${key} value too long`);
    where.push(encoded.length === 1 ? `${key} = ?` : `${key} IN (${encoded.map(() => "?").join(", ")})`);
    values.push(...encoded);
  }
  for (const [key, op] of [["from", ">="], ["to", "<"]] as const) {
    const raw = params.get(key);
    if (raw === null) continue;
    const ms = Number(raw);
    if (!Number.isSafeInteger(ms)) throw new BadRequest(`${key} must be epoch milliseconds`);
    where.push(`${spec.timeColumn} ${op} ?`);
    values.push(ms);
  }
  // D1 binds at most 100 parameters per statement; the page query adds 2 more.
  if (values.length > MAX_FILTER_BINDS) throw new BadRequest(`at most ${MAX_FILTER_BINDS} filter values in total`);
  return { where, params: values };
}

function decodeRow(spec: TableSpec, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    const type = spec.columns[column];
    if (value === null) out[column] = null;
    else if (type === "json") {
      try {
        out[column] = JSON.parse(String(value));
      } catch {
        out[column] = null;
      }
    } else if (type === "bool") out[column] = value === 1;
    else out[column] = value;
  }
  return out;
}

export interface LogPage {
  data: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Newest first, page-numbered, with the total: the shape the admin list pages use. */
export async function readLogs(env: Env, table: string, params: URLSearchParams): Promise<LogPage> {
  const spec = specOf(table);
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  if (!Number.isSafeInteger(page) || page < 1) throw new BadRequest("page must be 1 or more");
  if (!PAGE_SIZES.has(pageSize)) throw new BadRequest("pageSize must be 10, 20, 50 or 100");
  const offset = (page - 1) * pageSize;
  if (offset > MAX_OFFSET) throw new BadRequest("page is too deep: narrow the filters or the date range");

  const { where, params: values } = readFilters(spec, params);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = env[spec.db];
  const [rows, count] = await db.batch([
    db
      .prepare(`SELECT * FROM ${table} ${clause} ORDER BY ${spec.timeColumn} DESC, id DESC LIMIT ? OFFSET ?`)
      .bind(...values, pageSize, offset),
    db.prepare(`SELECT COUNT(*) AS total FROM ${table} ${clause}`).bind(...values),
  ]);
  const total = Number((count.results[0] as { total?: number } | undefined)?.total ?? 0);
  return {
    data: rows.results.map((r) => decodeRow(spec, r as Record<string, unknown>)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Row counts per value of one whitelisted column, most frequent first (top 100). */
export async function logStats(
  env: Env,
  table: string,
  params: URLSearchParams,
): Promise<{ groupBy: string; groups: Array<{ value: unknown; count: number }> }> {
  const spec = specOf(table);
  const groupBy = params.get("groupBy") ?? "";
  if (!spec.groupBy.includes(groupBy)) throw new BadRequest(`cannot group ${table} by ${groupBy || "(nothing)"}`);
  const { where, params: values } = readFilters(spec, params);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const res = await env[spec.db]
    .prepare(`SELECT ${groupBy} AS value, COUNT(*) AS count FROM ${table} ${clause} GROUP BY ${groupBy} ORDER BY count DESC LIMIT 100`)
    .bind(...values)
    .all<{ value: unknown; count: number }>();
  return {
    groupBy,
    groups: res.results.map((g) => ({
      value: spec.columns[groupBy] === "bool" && g.value !== null ? g.value === 1 : g.value,
      count: Number(g.count),
    })),
  };
}

/**
 * GDPR erasure and account cascades: delete, or redact per the table's `erase`
 * spec, every row whose `by` column holds one of `values` (1-90, one statement).
 */
export async function eraseLogs(env: Env, body: Record<string, unknown>): Promise<{ changed: number }> {
  const spec = specOf(body.table);
  const erase = spec.erase;
  if (!erase) throw new BadRequest(`${String(body.table)} cannot be erased`);
  const by = body.by;
  if (typeof by !== "string" || !erase.by.includes(by)) throw new BadRequest(`erase by one of: ${erase.by.join(", ")}`);
  const list = body.values;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_FILTER_BINDS) {
    throw new BadRequest(`values: 1-${MAX_FILTER_BINDS} entries`);
  }
  const values = list.map((v) => encodeValue(spec, by, v));
  if (values.includes(null)) throw new BadRequest("values cannot be empty");
  const match = `${by} IN (${values.map(() => "?").join(", ")})`;
  const db = env[spec.db];
  const statement =
    erase.mode === "delete"
      ? db.prepare(`DELETE FROM ${String(body.table)} WHERE ${match}`).bind(...values)
      : db
          .prepare(`UPDATE ${String(body.table)} SET ${Object.keys(erase.set).map((c) => `${c} = ?`).join(", ")} WHERE ${match}`)
          .bind(...Object.values(erase.set), ...values);
  const result = await statement.run();
  return { changed: result.meta.changes ?? 0 };
}
