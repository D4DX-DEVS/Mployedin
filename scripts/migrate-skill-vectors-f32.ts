/**
 * Rewrite cached skill vectors from 3,072 BSON doubles (42 KB a row) to the
 * form `lib/matching/skillVectors.ts` writes now: 768 float32 little-endian
 * bytes (3 KB a row).
 *
 * Why: a cold server reads ~180 of these before it can score a seeker's home
 * page. On the shared Atlas tier that read moved 7.5 MB at ~100 KB/s, which
 * is the 77 s the page sat on its skeleton after every deploy or restart
 * (measured 2026-10-16). Scoring already reads legacy rows truncated, so
 * numbers do not change when this runs; only the bytes do.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/migrate-skill-vectors-f32.ts            # dry run
 *   ... --apply        rewrite legacy rows in place
 *   ... --sample <n>   legacy rows kept for the drift report (default 200)
 *
 * The dry run reads every row (the slow part on a throttled cluster), counts
 * what would change, sizes the saving, and reports how far truncation moves
 * the cosines against SKILL_COSINE_EXACT / SKILL_COSINE_NEAR on sampled pairs.
 *
 * Run it only once the reader that understands float32 rows is deployed
 * everywhere that embeds (the app and the Inngest workers). The older reader
 * checks `dims === 3072`, treats a float32 row as foreign, re-embeds the skill
 * and writes a 3,072-number array back, undoing the rewrite one row at a time.
 *
 * Idempotent: rows already in the new form are skipped. Rollback: the rows
 * are a cache; deleting one makes the next digest re-embed it.
 */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import SkillVector from "@/models/SkillVector";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai/embeddings";
import { SKILL_COSINE_EXACT, SKILL_COSINE_NEAR } from "@/lib/matching/constants";
import { cosine, SKILL_VECTOR_DIMENSIONS, toSkillVector } from "@/lib/matching/skillSimilarity";
import { decodeStoredSkillVector, encodeSkillVector } from "@/lib/matching/skillVectors";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const SAMPLE = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) : 200;
const WRITE_BATCH = 50;
// ~200 KB a round trip. A 20-row batch starved the driver's heartbeats on the
// throttled cluster (PoolClearedOnNetworkError 300 rows in, 2026-10-16).
const READ_BATCH = 5;
const MAX_ATTEMPTS = 6;

const out = (line: string) => process.stdout.write(`${line}\n`);
const bsonSize = (doc: Record<string, unknown>) => mongoose.mongo.BSON.calculateObjectSize(doc);

interface Row { _id: mongoose.Types.ObjectId; canonical: string; vector: unknown; dims?: number; }
type Op = Parameters<mongoose.mongo.Collection["bulkWrite"]>[0][number];

/** Band a cosine falls in for scoring: the only thing truncation could move. */
function band(sim: number): "exact" | "near" | "none" {
  if (sim >= SKILL_COSINE_EXACT) return "exact";
  if (sim >= SKILL_COSINE_NEAR) return "near";
  return "none";
}

function driftReport(sample: Array<{ full: number[]; short: number[] }>): void {
  let pairs = 0, moved = 0, sumDelta = 0, maxDelta = 0;
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const a = cosine(sample[i].full, sample[j].full);
      const b = cosine(sample[i].short, sample[j].short);
      const delta = Math.abs(a - b);
      pairs++;
      sumDelta += delta;
      if (delta > maxDelta) maxDelta = delta;
      if (band(a) !== band(b)) moved++;
    }
  }
  if (pairs === 0) { out("drift: no legacy rows to compare"); return; }
  out(`drift over ${pairs} sampled pairs: mean |Δcos| ${(sumDelta / pairs).toFixed(4)}, max ${maxDelta.toFixed(4)}; ` +
    `pairs changing scoring band (${SKILL_COSINE_NEAR}/${SKILL_COSINE_EXACT}): ${moved} (${((100 * moved) / pairs).toFixed(2)}%)`);
}

(async () => {
  await connectDB();
  const col = SkillVector.collection;
  const total = await col.estimatedDocumentCount();
  out(`${APPLY ? "APPLY" : "DRY RUN"}: ${total} skill vectors`);

  let legacy = 0, done = 0, unexpected = 0, seen = 0;
  let bytesBefore = 0, bytesAfter = 0;
  const sample: Array<{ full: number[]; short: number[] }> = [];
  let ops: Op[] = [];
  const flush = async () => {
    if (ops.length === 0) return;
    await col.bulkWrite(ops, { ordered: false });
    ops = [];
  };

  const handle = (row: Row) => {
    seen++;
    if (!Array.isArray(row.vector)) {
      if (decodeStoredSkillVector(row.vector)) done++;
      else { unexpected++; out(`  skip "${row.canonical}": not a vector the app can read`); }
      return;
    }
    if (row.vector.length !== EMBEDDING_DIMENSIONS) {
      unexpected++;
      out(`  skip "${row.canonical}": array of ${row.vector.length}`);
      return;
    }
    const short = toSkillVector(row.vector);
    if (!short) { unexpected++; out(`  skip "${row.canonical}": zero vector`); return; }
    legacy++;
    const bytes = encodeSkillVector(short);
    bytesBefore += bsonSize({ vector: row.vector });
    bytesAfter += bsonSize({ vector: bytes });
    if (sample.length < SAMPLE) sample.push({ full: row.vector, short });
    if (APPLY) {
      ops.push({ updateOne: { filter: { _id: row._id }, update: { $set: { vector: bytes, dims: SKILL_VECTOR_DIMENSIONS } } } });
    }
  };

  // Rows are visited in _id order, so after a dropped connection the next
  // attempt carries on from the last row handled instead of starting over.
  // Queued ops survive a failed flush (flush clears them only on success) and
  // go out with the next one. Progress resets the failure budget: the run
  // stops after MAX_ATTEMPTS failures in a row, not that many over the whole read.
  let lastId: mongoose.Types.ObjectId | null = null;
  let failures = 0;
  for (;;) {
    const seenBefore = seen;
    try {
      const cursor = col
        .find(lastId ? { _id: { $gt: lastId } } : {}, { projection: { canonical: 1, vector: 1, dims: 1 }, sort: { _id: 1 } })
        .batchSize(READ_BATCH);
      for await (const doc of cursor) {
        const row = doc as unknown as Row;
        handle(row);
        lastId = row._id;
        if (ops.length >= WRITE_BATCH) await flush();
        if (seen % 100 === 0) out(`  ${seen}/${total} read`);
      }
      await flush();
      break;
    } catch (err) {
      failures = seen > seenBefore ? 1 : failures + 1;
      if (failures >= MAX_ATTEMPTS) throw err;
      out(`  interrupted after ${seen} rows (${String(err).slice(0, 90)}); resuming in 5 s`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  out(`legacy rows ${APPLY ? "rewritten" : "to rewrite"}: ${legacy}; already float32: ${done}; skipped: ${unexpected}`);
  out(`vector bytes: ${(bytesBefore / 1e6).toFixed(1)} MB -> ${(bytesAfter / 1e6).toFixed(1)} MB ` +
    `(${legacy ? (bytesBefore / Math.max(bytesAfter, 1)).toFixed(1) : "-"}x smaller)`);
  driftReport(sample);
  if (!APPLY && legacy > 0) out("Dry run: nothing written. Re-run with --apply to rewrite.");
  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  out(`ERROR ${String(err).slice(0, 400)}`);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
