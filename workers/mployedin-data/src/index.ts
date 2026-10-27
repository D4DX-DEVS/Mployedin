/**
 * mployedin-data: the app's gateway to D1 (logs) and Vectorize (embeddings).
 *
 * D1 and Vectorize are reached through Worker bindings; from outside Cloudflare
 * the only route is the account REST API, which is rate-limited for the whole
 * account and meant for admin use. The app (any host) calls this Worker
 * instead, with HMAC-signed requests (src/auth.ts).
 *
 *   GET  /health                               no auth
 *   POST /logs/batch        { rows: LogWrite[] }   1-500 writes, atomic per database
 *   POST /logs/erase        { table, by, values }  GDPR erasure / cascades (tables.ts erase)
 *   GET  /logs/:table       ?page&pageSize&from&to&<filter>=a,b   newest first + total
 *   GET  /logs/:table/stats ?groupBy=<col>&from&to&<filter>=...
 *   GET  /rollups/profile-views ?job_seeker_id&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   POST /rollups/rebuild   { since: epochMs }     after a backfill
 *   POST /vectors/upsert    { index, vectors }
 *   POST /vectors/query     { index, vector | id, topK?, filter?, returnMetadata? }
 *   POST /vectors/delete    { index, ids }
 *
 * Cron: src/retention.ts (archive to R2 + rollups).
 * Plan: docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md.
 */

import type { Env, ExecutionContext, ScheduledController } from "./types";
import { verifyRequest } from "./auth";
import { BadRequest, eraseLogs, logStats, readLogs, writeLogs } from "./logs";
import { deleteVectors, queryVectors, upsertVectors } from "./vectors";
import { rebuildRollups, runNightly } from "./retention";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function parseBody(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new BadRequest("body must be a JSON object");
}

async function profileViewRollups(env: Env, params: URLSearchParams): Promise<{ days: Array<{ day: string; views: number }> }> {
  const seeker = params.get("job_seeker_id") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!seeker || seeker.length > 64) throw new BadRequest("job_seeker_id is required");
  if (!DAY_PATTERN.test(from) || !DAY_PATTERN.test(to)) throw new BadRequest("from and to must be YYYY-MM-DD");
  const res = await env.DB_LOGS.prepare(
    "SELECT day, views FROM profile_view_daily WHERE job_seeker_id = ? AND day >= ? AND day <= ? ORDER BY day",
  )
    .bind(seeker, from, to)
    .all<{ day: string; views: number }>();
  return { days: res.results };
}

async function route(request: Request, env: Env, body: string): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = request.method;

  if (parts[0] === "logs") {
    if (method === "POST" && parts[1] === "batch" && parts.length === 2) {
      return json(await writeLogs(env, parseBody(body).rows));
    }
    if (method === "POST" && parts[1] === "erase" && parts.length === 2) return json(await eraseLogs(env, parseBody(body)));
    if (method === "GET" && parts.length === 2) return json(await readLogs(env, parts[1], url.searchParams));
    if (method === "GET" && parts.length === 3 && parts[2] === "stats") {
      return json(await logStats(env, parts[1], url.searchParams));
    }
  }
  if (parts[0] === "rollups") {
    if (method === "GET" && parts[1] === "profile-views") return json(await profileViewRollups(env, url.searchParams));
    if (method === "POST" && parts[1] === "rebuild") {
      const since = parseBody(body).since;
      if (typeof since !== "number" || !Number.isSafeInteger(since)) throw new BadRequest("since must be epoch milliseconds");
      return json(await rebuildRollups(env, since));
    }
  }
  if (parts[0] === "vectors" && method === "POST" && parts.length === 2) {
    if (parts[1] === "upsert") return json(await upsertVectors(env, parseBody(body)));
    if (parts[1] === "query") return json(await queryVectors(env, parseBody(body)));
    if (parts[1] === "delete") return json(await deleteVectors(env, parseBody(body)));
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });

    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) return json({ error: "body too large" }, 413);
    const body = request.method === "GET" ? "" : await request.text();
    if (body.length > MAX_BODY_BYTES) return json({ error: "body too large" }, 413);

    const auth = await verifyRequest(env.DATA_WORKER_SECRET, request, body);
    if (!auth.ok) return json({ error: "unauthorized" }, 401);

    try {
      return await route(request, env, body);
    } catch (err) {
      if (err instanceof BadRequest) return json({ error: err.message }, 400);
      // Never echo driver errors to the caller; they land in Workers Logs.
      console.error("[mployedin-data]", err);
      return json({ error: "internal error" }, 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runNightly(env).then(
        // warn, not log: the repo's lint allows only warn/error; Workers Logs keeps both.
        (report) => console.warn("[mployedin-data] nightly report", JSON.stringify(report)),
        (err) => console.error("[mployedin-data] nightly failed", err),
      ),
    );
  },
};
