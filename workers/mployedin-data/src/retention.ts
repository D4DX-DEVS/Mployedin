/**
 * Nightly job (Cron Trigger, wrangler.toml):
 *   1. archive: rows older than their table's retention are written to the
 *      ARCHIVE (private) R2 bucket, under log-archive/, as gzipped NDJSON, then deleted from D1, oldest first,
 *      in chunks; a chunk is deleted only after its file is stored;
 *   2. rollups: profile_view_daily is rebuilt for the last few days from raw rows.
 *
 * Bounded per run (CHUNKS_PER_RUN, shared by all tables): each chunk costs 2 D1
 * calls + 1 R2 put, and the Workers Free plan allows 50 D1 calls per invocation,
 * so a backlog drains over several nights rather than one run failing. Re-running is safe: archived
 * rows are gone, and file names carry the chunk's id range.
 */

import type { D1Database, Env } from "./types";
import { TABLES, retentionDays } from "./tables";

const DAY_MS = 24 * 60 * 60 * 1000;
export const ARCHIVE_CHUNK = 2000;
/** Archived rows live in the private bucket under this prefix (never the public one). */
export const ARCHIVE_PREFIX = "log-archive/";
/** Chunks archived per nightly run across all tables: 12 x 2 D1 calls + 9 selects + 2 rollup calls < 50. */
export const CHUNKS_PER_RUN = 12;
/** Delete statements bind ids in groups well under D1's 100 bound parameters. */
const DELETE_GROUP = 90;
const ROLLUP_DAYS = 3;

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function datePath(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

export interface ArchiveReport {
  table: string;
  /** Rows removed from D1 (archived to R2, or expired for an `archive: false` table). */
  archived: number;
  /** Archive files written to R2. */
  files: number;
  /** Chunks processed: what the nightly budget counts. */
  chunks: number;
  more: boolean;
}

export async function archiveTable(env: Env, table: string, now: number, maxChunks: number = CHUNKS_PER_RUN): Promise<ArchiveReport> {
  const spec = TABLES[table];
  const db: D1Database = env[spec.db];
  const cutoff = now - retentionDays(table, env.RETENTION_DAYS) * DAY_MS;
  const report: ArchiveReport = { table, archived: 0, files: 0, chunks: 0, more: false };

  for (let chunk = 0; chunk < maxChunks; chunk++) {
    const { results } = await db
      .prepare(`SELECT * FROM ${table} WHERE ${spec.timeColumn} < ? ORDER BY ${spec.timeColumn}, id LIMIT ?`)
      .bind(cutoff, ARCHIVE_CHUNK)
      .all<Record<string, unknown>>();
    if (results.length === 0) return report;

    if (spec.archive !== false) {
      const first = results[0];
      const last = results[results.length - 1];
      const key = `${ARCHIVE_PREFIX}${table}/${datePath(Number(first[spec.timeColumn]))}/${first.id}--${last.id}.ndjson.gz`;
      await env.ARCHIVE.put(key, await gzip(results.map((r) => JSON.stringify(r)).join("\n") + "\n"), {
        httpMetadata: { contentType: "application/x-ndjson", contentEncoding: "gzip" },
      });
      report.files++;
    }

    const ids = results.map((r) => String(r.id));
    const deletes = [];
    for (let i = 0; i < ids.length; i += DELETE_GROUP) {
      const group = ids.slice(i, i + DELETE_GROUP);
      deletes.push(db.prepare(`DELETE FROM ${table} WHERE id IN (${group.map(() => "?").join(", ")})`).bind(...group));
    }
    await db.batch(deletes);

    report.archived += results.length;
    report.chunks++;
    if (results.length < ARCHIVE_CHUNK) return report;
  }
  report.more = true;
  return report;
}

/**
 * Rebuild profile_view_daily from `sinceMs` (rounded down to a UTC day) onwards,
 * atomically. Clamped to the raw rows still in D1: days whose views were already
 * archived cannot be recounted, so their rollups are never deleted.
 */
export async function rebuildRollups(env: Env, sinceMs: number, now: number = Date.now()): Promise<{ since: string }> {
  // The first whole UTC day whose raw rows are all still in D1.
  const firstWholeDay = Math.ceil((now - retentionDays("profile_view", env.RETENTION_DAYS) * DAY_MS) / DAY_MS) * DAY_MS;
  const dayStart = Math.max(Math.floor(sinceMs / DAY_MS) * DAY_MS, firstWholeDay);
  const since = new Date(dayStart).toISOString().slice(0, 10);
  const db = env.DB_LOGS;
  await db.batch([
    db.prepare("DELETE FROM profile_view_daily WHERE day >= ?").bind(since),
    db
      .prepare(
        `INSERT INTO profile_view_daily (job_seeker_id, day, views)
         SELECT job_seeker_id, strftime('%Y-%m-%d', viewed_at / 1000, 'unixepoch') AS day, COUNT(*)
         FROM profile_view WHERE viewed_at >= ? GROUP BY job_seeker_id, day`,
      )
      .bind(dayStart),
  ]);
  return { since };
}

export async function runNightly(env: Env, now: number = Date.now()): Promise<{ archive: ArchiveReport[]; rollupsSince: string }> {
  const archive: ArchiveReport[] = [];
  let budget = CHUNKS_PER_RUN;
  for (const table of Object.keys(TABLES)) {
    // Out of budget: the table is still checked next night (reported as more = true).
    const report = budget > 0 ? await archiveTable(env, table, now, budget) : { table, archived: 0, files: 0, chunks: 0, more: true };
    budget -= report.chunks;
    archive.push(report);
  }
  const { since } = await rebuildRollups(env, now - (ROLLUP_DAYS - 1) * DAY_MS, now);
  return { archive, rollupsSince: since };
}
