/**
 * Where log rows are written (docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md part 2).
 *
 * LOGS_STORE=mongo (default): MongoDB only, exactly as before.
 * LOGS_STORE=dual: MongoDB stays the store every page reads, and each log write
 *   is also copied to D1 through the mployedin-data Worker under the same id.
 *   Run it with the backfill (scripts/backfill-logs-to-d1.ts) and compare the two
 *   (the backfill's --verify) before any reader moves to D1.
 * "dual" without DATA_WORKER_URL / DATA_WORKER_SECRET behaves as "mongo".
 *
 * Inserts are mirrored by d1LogMirror(), a schema plugin on each log model, so
 * no write site can miss it. The few in-place updates and deletes (receipt
 * status, notified flags, GDPR erasure, account cascades) call mirrorLogWrites /
 * mirrorLogErase next to their Mongo statement.
 *
 * A failed mirror never fails the request: Mongo already holds the row. It logs
 * `event: "log_mirror_failed"` (alert on it), and the backfill re-copies.
 * Erasure is the exception: mirrorLogErase throws, so erased data cannot
 * silently survive in D1.
 */
import type { Schema } from "mongoose";
import logger from "@/lib/logger";
import {
  dataWorkerConfigured,
  eraseLogRows,
  writeLogRows,
  type LogTable,
  type LogWrite,
} from "@/lib/cloudflare/dataWorkerClient";
import { toD1Row } from "@/lib/logs/d1Rows";

export type LogsStore = "mongo" | "dual";

/** A mirror must not hold a request up for long: Mongo already has the row. */
const MIRROR_TIMEOUT_MS = 3_000;
/** After a failed mirror, skip mirroring this long instead of making every request wait on a sick Worker. */
const MIRROR_BACKOFF_MS = 30_000;
/** The Worker's per-request cap (workers/mployedin-data/src/logs.ts MAX_BATCH_ROWS). */
export const LOG_BATCH_ROWS = 500;
/** Request bodies stay well under the Worker's 2 MB cap (one JSON column alone may be 60 KB). */
export const LOG_BATCH_BYTES = 1_500_000;

let pausedUntil = 0;

/** For tests: forget a previous failure. */
export function resetLogMirrorForTests(): void {
  pausedUntil = 0;
}

export function logsStore(env: Record<string, string | undefined> = process.env): LogsStore {
  return env.LOGS_STORE?.trim().toLowerCase() === "dual" && dataWorkerConfigured(env) ? "dual" : "mongo";
}

/** Splits writes into Worker-sized requests: at most LOG_BATCH_ROWS rows and LOG_BATCH_BYTES of JSON each. */
export function chunkLogWrites(writes: LogWrite[]): LogWrite[][] {
  const chunks: LogWrite[][] = [];
  let current: LogWrite[] = [];
  let bytes = 0;
  for (const write of writes) {
    const size = JSON.stringify(write).length + 1;
    if (current.length && (current.length >= LOG_BATCH_ROWS || bytes + size > LOG_BATCH_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(write);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Sends writes unless mirroring is backing off; a failure starts the back-off and is logged once. */
async function mirror(table: LogTable, build: () => LogWrite[]): Promise<void> {
  if (logsStore() !== "dual" || Date.now() < pausedUntil) return;
  let rows = 0;
  try {
    const writes = build();
    rows = writes.length;
    for (const chunk of chunkLogWrites(writes)) await writeLogRows(chunk, MIRROR_TIMEOUT_MS);
  } catch (err) {
    pausedUntil = Date.now() + MIRROR_BACKOFF_MS;
    logger.error(
      { err, event: "log_mirror_failed", table, rows, pausedForMs: MIRROR_BACKOFF_MS },
      "[logStore] D1 mirror failed; mirroring paused (the backfill re-copies)",
    );
  }
}

/** Copies freshly written Mongo documents to D1. Never throws. */
export async function mirrorLogDocs(table: LogTable, docs: unknown[]): Promise<void> {
  if (docs.length === 0) return;
  await mirror(table, () => {
    const writes: LogWrite[] = [];
    for (const doc of docs) {
      const row = toD1Row(table, doc);
      if (row) writes.push({ table, row });
    }
    const skipped = docs.length - writes.length;
    if (skipped) logger.warn({ event: "log_mirror_skipped", table, skipped }, "[logStore] documents missing a required value were not mirrored");
    return writes;
  });
}

/** Mirrors in-place updates (op: "update") to D1. Never throws. */
export async function mirrorLogWrites(table: LogTable, writes: LogWrite[]): Promise<void> {
  if (writes.length === 0) return;
  await mirror(table, () => writes);
}

/**
 * Mirrors a GDPR erasure or account cascade to D1 (delete or redact, per the
 * table's erase spec in the Worker). Runs whenever the Worker is configured,
 * whatever LOGS_STORE says: D1 may hold rows from an earlier dual period or a
 * backfill. Ignores the back-off and throws on failure: erased data must not
 * stay behind in D1 unnoticed.
 */
export async function mirrorLogErase(table: LogTable, by: string, values: string[]): Promise<void> {
  if (!dataWorkerConfigured() || values.length === 0) return;
  await eraseLogRows(table, by, values);
}

type MirrorDoc = { isNew?: boolean; $locals?: Record<string, unknown> };

/**
 * Schema plugin: after Mongo inserts a log document (create / new + save /
 * insertMany), copy it to D1. Applied in each log model file.
 *
 * Only inserts: a later save() of a loaded document would upsert a possibly
 * stale snapshot over newer D1 status columns. In-place changes are mirrored by
 * their callers. An unordered insertMany that partly fails skips Mongoose's
 * normal post hook, so the error hook mirrors the rows that did go in.
 */
export function d1LogMirror(table: LogTable): ((schema: Schema) => void) & { d1Table: LogTable } {
  const plugin = (schema: Schema): void => {
    schema.pre("save", function (this: MirrorDoc) {
      if (this.$locals) this.$locals.d1Insert = this.isNew;
    });
    schema.post("save", async function (doc: MirrorDoc) {
      if (doc?.$locals?.d1Insert === false) return;
      await mirrorLogDocs(table, [doc]);
    });
    schema.post("insertMany", async function (docs: unknown) {
      await mirrorLogDocs(table, Array.isArray(docs) ? docs : [docs]);
    });
    // Three parameters make Kareem treat this as the error handler; the original
    // error still reaches the caller after the returned promise settles.
    schema.post("insertMany", async function (error: unknown, _docs: unknown, _next: unknown) {
      await mirrorLogDocs(table, (error as { insertedDocs?: unknown[] } | null)?.insertedDocs ?? []);
    });
  };
  // Lets a test find which models carry the mirror (schema.plugins keeps the function).
  return Object.assign(plugin, { d1Table: table });
}
