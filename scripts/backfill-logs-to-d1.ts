/**
 * Copy the log collections from MongoDB to D1 (through the mployedin-data
 * Worker), and compare the two. Plan: docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md part 2.
 *
 * Rows keep their Mongo _id as the D1 id and the Worker inserts with
 * ON CONFLICT(id), so a re-run (or a row the live LOGS_STORE=dual mirror already
 * wrote) is a no-op: run it as often as needed. Mongo is only read.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/backfill-logs-to-d1.ts            # dry run: counts, unmappable rows
 *   ... --apply                    copy every table
 *   ... --apply --table audit_log  one table
 *   ... --since 2026-01-01         only documents created on/after this date
 *   ... --verify                   compare a window (--since, default the last 30 days): the rows
 *                                  D1 should hold (Mongo rows that map) against D1's count, and the
 *                                  status split for email / WhatsApp, where receipts change rows
 *
 * Order: deploy the Worker -> set LOGS_STORE=dual and redeploy the app (new rows
 * now land in both) -> this --apply (history) -> this --verify. Readers move to
 * D1 only after --verify matches.
 */

import mongoose, { type Model } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import {
  dataWorkerConfigured,
  readLogPage,
  readLogStats,
  rebuildLogRollups,
  writeLogRows,
  type LogTable,
  type LogWrite,
} from "@/lib/cloudflare/dataWorkerClient";
import { toD1Row, epochMs } from "@/lib/logs/d1Rows";
import { LOG_BATCH_ROWS, chunkLogWrites } from "@/lib/logs/logStore";
import AuditLog from "@/models/AuditLog";
import ConsentLog from "@/models/ConsentLog";
import EmailLog from "@/models/EmailLog";
import WhatsAppMessageLog from "@/models/WhatsAppMessageLog";
import ActivityEvent from "@/models/ActivityEvent";
import ProfileView from "@/models/ProfileView";
import CompanyProfileView from "@/models/CompanyProfileView";
import ResourceDownloadLog from "@/models/ResourceDownloadLog";

const MODELS: Record<LogTable, { model: Model<unknown>; timeField: string }> = {
  audit_log: { model: AuditLog as Model<unknown>, timeField: "createdAt" },
  consent_log: { model: ConsentLog as Model<unknown>, timeField: "createdAt" },
  email_log: { model: EmailLog as Model<unknown>, timeField: "sentAt" },
  whatsapp_log: { model: WhatsAppMessageLog as Model<unknown>, timeField: "sentAt" },
  activity_event: { model: ActivityEvent as Model<unknown>, timeField: "createdAt" },
  profile_view: { model: ProfileView as Model<unknown>, timeField: "viewedAt" },
  company_profile_view: { model: CompanyProfileView as Model<unknown>, timeField: "viewedAt" },
  resource_download: { model: ResourceDownloadLog as Model<unknown>, timeField: "downloadedAt" },
};

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const VERIFY = args.includes("--verify");
const arg = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const TABLE = arg("--table");
const SINCE = arg("--since");

const out = (line: string) => process.stdout.write(`${line}\n`);

function tables(): LogTable[] {
  const all = Object.keys(MODELS) as LogTable[];
  if (!TABLE) return all;
  if (!all.includes(TABLE as LogTable)) {
    out(`Unknown --table ${TABLE}. One of: ${all.join(", ")}`);
    process.exit(1);
  }
  return [TABLE as LogTable];
}

async function copyTable(table: LogTable, since: Date | undefined): Promise<{ read: number; written: number; skipped: number }> {
  const { model, timeField } = MODELS[table];
  const filter = since ? { [timeField]: { $gte: since } } : {};
  let read = 0;
  let written = 0;
  let skipped = 0;
  let batch: LogWrite[] = [];
  const flush = async () => {
    if (!batch.length) return;
    // Sized by bytes too: 500 rows of large JSON would pass the Worker's 2 MB cap.
    if (APPLY) for (const chunk of chunkLogWrites(batch)) written += (await writeLogRows(chunk)).written;
    batch = [];
  };
  // _id order: a stable cursor that never revisits a document.
  for await (const doc of model.find(filter).sort({ _id: 1 }).lean().cursor()) {
    read++;
    const row = toD1Row(table, doc);
    if (!row) {
      skipped++;
      continue;
    }
    batch.push({ table, row });
    if (batch.length >= LOG_BATCH_ROWS) {
      await flush();
      process.stdout.write(`\r  ${table}: ${read} read`);
    }
  }
  await flush();
  process.stdout.write("\r");
  return { read, written, skipped };
}

/** Tables whose rows change after insert (delivery receipts): compare their status split too. */
const STATUS_TABLES = new Set<LogTable>(["email_log", "whatsapp_log"]);
const DEFAULT_VERIFY_DAYS = 30;

/**
 * Compares one time window. Older rows can differ by design: D1 archives rows
 * past retention, and Mongo keeps (or TTL-deletes) on its own schedule. The
 * window ends two minutes ago, so rows still being mirrored don't count.
 */
async function verifyTable(table: LogTable, from: Date, to: Date): Promise<boolean> {
  const { model, timeField } = MODELS[table];
  let expected = 0;
  const mongoStatus = new Map<string, number>();
  for await (const doc of model.find({ [timeField]: { $gte: from, $lt: to } }).lean().cursor()) {
    const row = toD1Row(table, doc);
    if (!row) continue;
    expected++;
    if (STATUS_TABLES.has(table)) mongoStatus.set(String(row.status), (mongoStatus.get(String(row.status)) ?? 0) + 1);
  }
  const range = { from: from.getTime(), to: to.getTime() };
  const d1 = await readLogPage(table, { ...range, pageSize: 10 });
  let statusDiff = "";
  if (STATUS_TABLES.has(table)) {
    const { groups } = await readLogStats(table, { ...range, groupBy: "status" });
    const d1Status = new Map(groups.map((g) => [String(g.value), g.count]));
    const keys = [...new Set([...mongoStatus.keys(), ...d1Status.keys()])].sort();
    const diffs = keys.filter((k) => (mongoStatus.get(k) ?? 0) !== (d1Status.get(k) ?? 0));
    statusDiff = diffs.map((k) => `${k} mongo ${mongoStatus.get(k) ?? 0} / d1 ${d1Status.get(k) ?? 0}`).join(", ");
  }
  const ok = d1.total === expected && !statusDiff;
  out(
    `  ${ok ? "OK  " : "DIFF"} ${table.padEnd(22)} expected ${String(expected).padStart(8)}  d1 ${String(d1.total).padStart(8)}` +
      (statusDiff ? `  status: ${statusDiff}` : ""),
  );
  return ok;
}

async function main(): Promise<void> {
  if (!dataWorkerConfigured()) {
    out("DATA_WORKER_URL / DATA_WORKER_SECRET are not set (workers/mployedin-data/README.md).");
    process.exit(1);
  }
  const since = SINCE ? new Date(SINCE) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    out(`--since ${SINCE} is not a date`);
    process.exit(1);
  }

  await connectDB();

  if (VERIFY) {
    const from = since ?? new Date(Date.now() - DEFAULT_VERIFY_DAYS * 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() - 2 * 60 * 1000);
    out(`Mongo vs D1, ${from.toISOString()} to ${to.toISOString()}:`);
    let allOk = true;
    for (const table of tables()) allOk = (await verifyTable(table, from, to)) && allOk;
    out(allOk ? "\nEvery table matches." : "\nDifferences found: re-run --apply for those tables, then --verify again.");
    await mongoose.disconnect();
    process.exit(allOk ? 0 : 2);
  }

  out(`Mode: ${APPLY ? "APPLY (writing to D1)" : "DRY RUN (nothing written)"}${since ? `, since ${since.toISOString()}` : ""}`);
  let earliestProfileView: number | undefined;
  for (const table of tables()) {
    const r = await copyTable(table, since);
    out(`  ${table.padEnd(22)} read ${String(r.read).padStart(8)}  ${APPLY ? `written ${String(r.written).padStart(8)}` : ""}  skipped ${r.skipped} (missing a required value)`);
    if (table === "profile_view" && r.read) {
      const first = (await MODELS.profile_view.model.findOne(since ? { viewedAt: { $gte: since } } : {}).sort({ viewedAt: 1 }).select("viewedAt").lean()) as {
        viewedAt?: Date;
      } | null;
      earliestProfileView = epochMs(first?.viewedAt);
    }
  }
  if (APPLY && earliestProfileView !== undefined) {
    const { since: from } = await rebuildLogRollups(earliestProfileView);
    out(`Profile-view daily rollups rebuilt from ${from}.`);
  }
  out(APPLY ? "\nDone. Now run with --verify." : "\nDry run only. Add --apply to copy.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
