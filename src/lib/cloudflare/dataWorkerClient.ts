import { createHash, createHmac } from "crypto";

/**
 * Client for the mployedin-data Cloudflare Worker (workers/mployedin-data): the
 * app's only route to D1 (logs) and Vectorize (embeddings). Server-only.
 *
 * Env: DATA_WORKER_URL (https://mployedin-data.<account>.workers.dev or a
 * custom domain) and DATA_WORKER_SECRET (>= 32 chars, the same value set on the
 * Worker with `wrangler secret put DATA_WORKER_SECRET`). Unset = not configured:
 * callers keep using MongoDB.
 *
 * Signing matches workers/mployedin-data/src/auth.ts:
 *   hex(HMAC-SHA256(secret, "<ms>.<METHOD>.<path+query>.<hex sha256(body)>"))
 */

const TIMEOUT_MS = 10_000;

export class DataWorkerError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "DataWorkerError";
  }
}

export function dataWorkerConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.DATA_WORKER_URL?.trim() && (env.DATA_WORKER_SECRET?.length ?? 0) >= 32);
}

export function signWorkerRequest(
  secret: string,
  timestamp: string,
  method: string,
  pathWithQuery: string,
  body: string,
): string {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  return createHmac("sha256", secret)
    .update(`${timestamp}.${method.toUpperCase()}.${pathWithQuery}.${bodyHash}`, "utf8")
    .digest("hex");
}

/** One signed call. Throws DataWorkerError on a non-2xx answer, a timeout or a network failure. */
export async function dataWorkerFetch<T>(
  method: "GET" | "POST",
  pathWithQuery: string,
  payload?: unknown,
  timeoutMs: number = TIMEOUT_MS,
): Promise<T> {
  const base = process.env.DATA_WORKER_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.DATA_WORKER_SECRET ?? "";
  if (!base || secret.length < 32) throw new DataWorkerError(503, "data worker is not configured");

  const body = method === "GET" || payload === undefined ? "" : JSON.stringify(payload);
  const timestamp = String(Date.now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}${pathWithQuery}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-mp-timestamp": timestamp,
        "x-mp-signature": signWorkerRequest(secret, timestamp, method, pathWithQuery, body),
      },
      ...(body && { body }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new DataWorkerError(504, err instanceof Error && err.name === "AbortError" ? "data worker timed out" : "data worker unreachable");
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new DataWorkerError(res.status, data.error ?? `data worker answered ${res.status}`);
  return data as T;
}

// ─── Typed calls ────────────────────────────────────────────────────────────

export type LogTable =
  | "audit_log"
  | "consent_log"
  | "email_log"
  | "whatsapp_log"
  | "activity_event"
  | "profile_view"
  | "company_profile_view"
  | "resource_download";

export interface LogWrite {
  table: LogTable;
  op?: "upsert" | "update";
  row: Record<string, unknown>;
  where?: Record<string, string>;
  /** update only: one mutable column must hold one of these values (workers/mployedin-data/src/logs.ts). */
  onlyIf?: Record<string, string[]>;
}

export interface LogPage<T = Record<string, unknown>> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * `unmatched`: positions in `rows` of `update` writes that found no row yet (a
 * receipt that beat its insert). Retry those later; everything else is stored.
 */
export function writeLogRows(rows: LogWrite[], timeoutMs?: number): Promise<{ written: number; unmatched: number[] }> {
  return dataWorkerFetch("POST", "/logs/batch", { rows }, timeoutMs);
}

/** The Worker's per-statement cap on erase values (D1 binds at most 100 parameters). */
export const LOG_ERASE_CHUNK = 90;

/**
 * Deletes or redacts (per the table's erase spec in workers/mployedin-data/src/tables.ts)
 * every row whose `by` column holds one of `values`, LOG_ERASE_CHUNK per call.
 */
export async function eraseLogRows(table: LogTable, by: string, values: string[]): Promise<{ changed: number }> {
  let changed = 0;
  for (let i = 0; i < values.length; i += LOG_ERASE_CHUNK) {
    const res = await dataWorkerFetch<{ changed: number }>("POST", "/logs/erase", {
      table,
      by,
      values: values.slice(i, i + LOG_ERASE_CHUNK),
    });
    changed += res.changed;
  }
  return { changed };
}

export function readLogPage<T = Record<string, unknown>>(
  table: LogTable,
  params: Record<string, string | number | undefined>,
): Promise<LogPage<T>> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") query.set(k, String(v));
  const qs = query.toString();
  return dataWorkerFetch("GET", `/logs/${table}${qs ? `?${qs}` : ""}`);
}

/** Row counts per value of one whitelisted column (the Worker's groupBy list), filtered like readLogPage. */
export function readLogStats(
  table: LogTable,
  params: Record<string, string | number | undefined> & { groupBy: string },
): Promise<{ groupBy: string; groups: Array<{ value: unknown; count: number }> }> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") query.set(k, String(v));
  return dataWorkerFetch("GET", `/logs/${table}/stats?${query.toString()}`);
}

/** Rebuilds the daily profile-view rollups from `since` (epoch ms) on: run after a backfill. */
export function rebuildLogRollups(since: number): Promise<{ since: string }> {
  return dataWorkerFetch("POST", "/rollups/rebuild", { since });
}

export type VectorIndexName = "jobs" | "seekers" | "search";

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/** The Worker's per-call cap (workers/mployedin-data/src/vectors.ts MAX_UPSERT): 50 × 1024 floats fits its 2 MB body limit. */
export const VECTOR_UPSERT_CHUNK = 50;

/** Upserts any number of vectors, VECTOR_UPSERT_CHUNK per call, in order. */
export async function upsertVectors(
  index: VectorIndexName,
  vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string | number | boolean> }>,
): Promise<{ upserted: number }> {
  let upserted = 0;
  for (let i = 0; i < vectors.length; i += VECTOR_UPSERT_CHUNK) {
    const res = await dataWorkerFetch<{ upserted: number }>("POST", "/vectors/upsert", {
      index,
      vectors: vectors.slice(i, i + VECTOR_UPSERT_CHUNK),
    });
    upserted += res.upserted;
  }
  return { upserted };
}

export function queryVectors(
  index: VectorIndexName,
  query: { vector?: number[]; id?: string; topK?: number; filter?: Record<string, unknown>; returnMetadata?: boolean },
  timeoutMs?: number,
): Promise<{ matches: VectorMatch[] }> {
  return dataWorkerFetch("POST", "/vectors/query", { index, ...query }, timeoutMs);
}

/** The Worker's per-call cap on deleted ids (workers/mployedin-data/src/vectors.ts MAX_DELETE). */
export const VECTOR_DELETE_CHUNK = 1000;

/** Deletes any number of vectors, VECTOR_DELETE_CHUNK per call. */
export async function deleteVectors(index: VectorIndexName, ids: string[]): Promise<{ deleted: number }> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += VECTOR_DELETE_CHUNK) {
    const res = await dataWorkerFetch<{ deleted: number }>("POST", "/vectors/delete", {
      index,
      ids: ids.slice(i, i + VECTOR_DELETE_CHUNK),
    });
    deleted += res.deleted;
  }
  return { deleted };
}
