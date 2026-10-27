#!/usr/bin/env node
/**
 * Is Inngest Cloud running the functions this code declares? READ-ONLY.
 *
 * Inngest runs its own copy of the app's function list — the one from the last
 * *sync* — not whatever is deployed. Nothing re-syncs it on a DigitalOcean
 * deploy, so the two drift: on 2026-10-27 Inngest was still firing four
 * functions deleted from the code (every one failing with "No function ID
 * found in request"), had never run ones added since September, and ran the
 * job-alert digest once a day at 09:00 UTC instead of hourly — which is why no
 * Gulf or Indian seeker received a job alert for five weeks (issue #11).
 *
 * This compares the two:
 *   - the code side is read from src/app/api/inngest/route.ts and the files it
 *     imports (function id + cron trigger);
 *   - the Inngest side is the run history, from the `inngest/function.finished`
 *     and `inngest/function.failed` events (REST /v1/events — the only listing
 *     endpoint on this plan; /v1/apps and /v1/functions 404).
 *
 * It prints three tables and exits 1 when any is non-empty:
 *   STALE    runs in Inngest, absent from the code  → registry predates a removal
 *   MISSING  cron in the code, due in the window, never ran → registry predates an add
 *   OFF-SCHEDULE  ran far less often than its cron, or at hours it never fires
 *
 * Run it after every deploy, once Inngest has been resynced (DEPLOYMENT.md):
 *   node --env-file=.env scripts/check-inngest-sync.mjs           # last 48 hours
 *   node --env-file=.env scripts/check-inngest-sync.mjs 24        # last 24 hours
 *
 * Needs INNGEST_SIGNING_KEY (the production key). Sends GET requests only, and
 * never prints the key or any event payload.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ID = "mployedin";
const HOURS = Math.max(1, Math.min(168, Number(process.argv[2]) || 48));

// ── Code side ────────────────────────────────────────────────────────────────

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const aliasToFile = (spec) => `${spec.replace(/^@\//, "src/")}.ts`;

/** `export const <name> = <factory>({ ... id: "x" ... triggers/cron ... })` → { id, cron?, event? } */
function declarationIn(src, name) {
  const start = src.search(new RegExp(`export const ${name}\\s*=`));
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport const /);
  const block = next < 0 ? rest : rest.slice(0, next);
  const id = block.match(/\bid:\s*["'`]([^"'`]+)["'`]/)?.[1];
  if (!id) return null;
  return {
    id,
    cron: block.match(/\bcron:\s*["'`]([^"'`]+)["'`]/)?.[1],
    event: block.match(/\bevent:\s*["'`]([^"'`]+)["'`]/)?.[1],
  };
}

function codeRegistry() {
  const route = stripComments(read("src/app/api/inngest/route.ts"));
  const fileOf = new Map();
  for (const m of route.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const name of m[1].split(",").map((s) => s.trim()).filter(Boolean)) fileOf.set(name, aliasToFile(m[2]));
  }
  const list = route.match(/functions:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  const entries = list.split(",").map((s) => s.trim()).filter(Boolean);

  const fns = [];
  const unresolved = [];
  for (const entry of entries) {
    const spread = entry.startsWith("...");
    const name = entry.replace(/^\.\.\./, "");
    const file = fileOf.get(name);
    if (!file) { unresolved.push(name); continue; }
    const src = stripComments(read(file));
    const names = spread
      ? (src.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? "")
          .split(",").map((s) => s.trim()).filter(Boolean)
      : [name];
    for (const n of names) {
      const decl = declarationIn(src, n);
      if (decl) fns.push({ ...decl, fid: `${APP_ID}-${decl.id}` });
      else unresolved.push(n);
    }
  }
  return { fns, unresolved };
}

// ── Cron maths (the 5-field subset used in this repo: *, */n, a-b, a,b, n) ─────

function fieldMatches(field, value) {
  return field.split(",").some((part) => {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (range === "*") return value % step === 0;
    const [lo, hi] = range.split("-").map(Number);
    const top = Number.isFinite(hi) ? hi : stepRaw ? Infinity : lo;
    return value >= lo && value <= top && (value - lo) % step === 0;
  });
}

function cronFires(expr, d) {
  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);
  const weekday = d.getUTCDay();
  return (
    fieldMatches(min, d.getUTCMinutes()) &&
    fieldMatches(hour, d.getUTCHours()) &&
    fieldMatches(dom, d.getUTCDate()) &&
    fieldMatches(mon, d.getUTCMonth() + 1) &&
    (fieldMatches(dow, weekday) || (weekday === 0 && fieldMatches(dow, 7)))
  );
}

/** Firings a cron is due in [from, to), and the UTC hours they fall in. */
function expectedFirings(expr, from, to) {
  let count = 0;
  const hours = new Set();
  for (let t = Math.ceil(from / 60_000) * 60_000; t < to; t += 60_000) {
    const d = new Date(t);
    if (cronFires(expr, d)) { count++; hours.add(d.getUTCHours()); }
  }
  return { count, hours };
}

// ── Inngest side ─────────────────────────────────────────────────────────────

async function inngestRuns(from, to) {
  const key = process.env.INNGEST_SIGNING_KEY;
  if (!key) throw new Error("INNGEST_SIGNING_KEY is not set — run with --env-file=.env");
  const headers = { Authorization: `Bearer ${key}` };
  const runs = new Map();
  let truncated = 0;
  for (let t = from; t < to; t += 3_600_000) {
    for (const name of ["inngest/function.finished", "inngest/function.failed"]) {
      const url = new URL("https://api.inngest.com/v1/events");
      url.searchParams.set("name", name);
      url.searchParams.set("limit", "100");
      url.searchParams.set("received_after", new Date(t).toISOString());
      url.searchParams.set("received_before", new Date(Math.min(t + 3_600_000, to)).toISOString());
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Inngest events API answered ${res.status}`);
      const data = (await res.json()).data ?? [];
      if (data.length >= 100) truncated++;
      for (const e of data) {
        const fid = e.data?.function_id;
        if (!fid) continue;
        const r = runs.get(fid) ?? { ids: new Set(), failedIds: new Set(), hours: new Set(), firstError: undefined };
        // A failed run emits both a "finished" and a "failed" event; count runs, not events.
        const runId = e.data?.run_id ?? e.id;
        r.ids.add(runId);
        r.hours.add(new Date(e.received_at).getUTCHours());
        const err = e.data?.error;
        if (name.endsWith("failed") || err) {
          r.failedIds.add(runId);
          r.firstError ??= String(err?.message ?? err?.error ?? "failed").slice(0, 70);
        }
        runs.set(fid, r);
      }
    }
  }
  for (const r of runs.values()) {
    r.count = r.ids.size;
    r.failed = r.failedIds.size;
  }
  return { runs, truncated };
}

// ── Compare ──────────────────────────────────────────────────────────────────

const fmtHours = (set) => [...set].sort((a, b) => a - b).map((h) => String(h).padStart(2, "0")).join(",") || "-";

function printTable(title, rows) {
  console.log(`\n${title} (${rows.length})`);
  if (rows.length === 0) { console.log("  none"); return; }
  const widths = Object.keys(rows[0]).map((k) => Math.max(k.length, ...rows.map((r) => String(r[k]).length)));
  const line = (vals) => "  " + vals.map((v, i) => String(v).padEnd(widths[i])).join("  ");
  console.log(line(Object.keys(rows[0])));
  for (const r of rows) console.log(line(Object.values(r)));
}

const to = Date.now();
const from = to - HOURS * 3_600_000;
const { fns, unresolved } = codeRegistry();
const { runs, truncated } = await inngestRuns(from, to);
const codeIds = new Set(fns.map((f) => f.fid));

const stale = [...runs]
  .filter(([fid]) => !codeIds.has(fid))
  .map(([fid, r]) => ({ function: fid, runs: r.count, failed: r.failed, "UTC hours": fmtHours(r.hours), error: r.firstError ?? "" }));

const missing = [];
const offSchedule = [];
for (const f of fns.filter((fn) => fn.cron)) {
  const exp = expectedFirings(f.cron, from, to);
  if (exp.count === 0) continue; // not due in this window (e.g. a weekly job)
  const seen = runs.get(f.fid);
  if (!seen) {
    missing.push({ function: f.fid, "code cron": f.cron, "due in window": exp.count });
    continue;
  }
  // Flag only gross under-firing (a slow run can slip past a window edge), or
  // hours the code's cron never fires at.
  const strayHours = [...seen.hours].filter((h) => !exp.hours.has(h));
  if (seen.count < exp.count * 0.5 || strayHours.length > 0) {
    offSchedule.push({
      function: f.fid,
      "code cron": f.cron,
      due: exp.count,
      ran: seen.count,
      "ran at UTC hours": fmtHours(seen.hours),
    });
  }
}

console.log(`Inngest sync check — last ${HOURS}h, ${fns.length} functions in code, ${runs.size} seen running in Inngest.`);
if (truncated > 0) console.log(`Note: ${truncated} hour-window(s) hit the 100-event page limit; counts there are a floor.`);
if (unresolved.length > 0) console.log(`Note: couldn't resolve ${unresolved.join(", ")} from route.ts — check them by hand.`);
printTable("STALE — runs in Inngest, not in the code", stale);
printTable("MISSING — cron in the code, due in the window, never ran", missing);
printTable("OFF-SCHEDULE — ran far less often than its cron, or at other hours", offSchedule);

const drifted = stale.length + missing.length + offSchedule.length > 0;
console.log(
  drifted
    ? "\nInngest's copy of the app is out of date. Resync it (DEPLOYMENT.md → Post-deploy: resync Inngest), wait for the next runs, then re-run this."
    : "\nInngest matches the code.",
);
process.exit(drifted ? 1 : 0);
