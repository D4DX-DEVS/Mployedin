/**
 * Move every job seeker's admin search vector (JobSeeker.searchEmbedding, 3072
 * numbers, about 40 KB a profile and most of the database) from MongoDB to
 * Cloudflare Vectorize, cut to 768 (lib/ai/searchVectors.ts). Plan:
 * docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md section 6.
 *
 * Usage (in this order):
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/move-search-vectors-to-vectorize.ts   # dry run: counts, Vectorize budget, space to free
 *   ... --apply    copy the vectors to Vectorize and mark each profile (searchVectorAt). Mongo keeps its copy.
 *   ... --verify   query 20 copied vectors by id: each must come back as its own nearest match
 *   Then set SEARCH_VECTOR_STORE=vectorize and redeploy the app (search reads Vectorize from now on).
 *   ... --unset    re-runs the verify; if it passes, removes searchEmbedding from the marked
 *                  profiles (this is what frees the space) and drops the Atlas search index.
 *
 * Safe to re-run: --apply resumes after the profiles already marked, and upserts replace by id. --unset refuses unless
 * SEARCH_VECTOR_STORE=vectorize is set, so search never loses its vectors.
 */

import { connectDB } from "@/lib/db/mongoose";
import { dataWorkerConfigured, queryVectors, upsertVectors } from "@/lib/cloudflare/dataWorkerClient";
import { SEARCH_VECTOR_DIMS, searchVectorStore, toSearchVector } from "@/lib/ai/searchVectors";
import { VECTOR_INDEX_NAME } from "@/lib/ai/atlasVectorSearch";
import JobSeeker from "@/models/JobSeeker";

const FREE_STORED_DIMENSIONS = 5_000_000;
const BATCH = 50;
const VERIFY_SAMPLE = 20;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const VERIFY = args.includes("--verify");
const UNSET = args.includes("--unset");
const out = (line: string) => process.stdout.write(`${line}\n`);

const HAS_VECTOR = { "searchEmbedding.0": { $exists: true } };

/** A network blip on one batch shouldn't stop a 6,000-profile copy: 3 tries, 2 s then 4 s apart. */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function copy(): Promise<{ copied: number; skipped: number }> {
  let copied = 0;
  let skipped = 0;
  let batch: Array<{ id: string; values: number[] }> = [];
  const flush = async () => {
    if (batch.length === 0) return;
    if (APPLY) {
      await withRetry(() => upsertVectors("search", batch));
      await JobSeeker.updateMany({ _id: { $in: batch.map((b) => b.id) } }, { $set: { searchVectorAt: new Date() } }, { timestamps: false });
    }
    copied += batch.length;
    batch = [];
    process.stdout.write(`\r  ${copied} copied`);
  };
  // A re-run resumes: profiles already marked as copied are skipped.
  for await (const doc of JobSeeker.find({ ...HAS_VECTOR, searchVectorAt: { $exists: false } }).select("+searchEmbedding").sort({ _id: 1 }).lean().cursor()) {
    const values = toSearchVector((doc as { searchEmbedding?: number[] }).searchEmbedding ?? []);
    if (!values) {
      skipped++;
      continue;
    }
    batch.push({ id: String(doc._id), values });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  process.stdout.write("\r");
  return { copied, skipped };
}

async function verify(): Promise<boolean> {
  const sample = (await JobSeeker.aggregate([
    { $match: { searchVectorAt: { $exists: true } } },
    { $sample: { size: VERIFY_SAMPLE } },
    { $project: { _id: 1 } },
  ])) as Array<{ _id: unknown }>;
  if (sample.length === 0) {
    out("  No profile is marked as copied yet: run --apply first.");
    return false;
  }
  let found = 0;
  for (const { _id } of sample) {
    const { matches } = await queryVectors("search", { id: String(_id), topK: 1 });
    if (matches[0]?.id === String(_id)) found++;
  }
  out(`  ${found === sample.length ? "OK  " : "DIFF"} ${found}/${sample.length} sampled vectors found in Vectorize`);
  return found === sample.length;
}

async function main(): Promise<void> {
  if (!dataWorkerConfigured()) {
    out("DATA_WORKER_URL / DATA_WORKER_SECRET are not set (workers/mployedin-data/README.md).");
    process.exit(1);
  }
  await connectDB();

  if (VERIFY || UNSET) {
    const ok = await verify();
    if (!ok) {
      out("Vectorize applies writes asynchronously: wait a minute, then --verify again (or --apply again).");
      process.exit(2);
    }
    if (!UNSET) process.exit(0);
    if (searchVectorStore() !== "vectorize") {
      out("Refusing --unset: set SEARCH_VECTOR_STORE=vectorize (and redeploy the app) first, or search would lose its vectors.");
      process.exit(1);
    }
    const res = await JobSeeker.updateMany(
      { searchVectorAt: { $exists: true }, ...HAS_VECTOR },
      { $unset: { searchEmbedding: 1 } },
      { timestamps: false },
    );
    out(`Removed searchEmbedding from ${res.modifiedCount} profiles.`);
    try {
      await JobSeeker.collection.dropSearchIndex(VECTOR_INDEX_NAME);
      out(`Dropped the Atlas search index ${VECTOR_INDEX_NAME}.`);
    } catch (err) {
      out(`Atlas search index ${VECTOR_INDEX_NAME} not dropped (${err instanceof Error ? err.message : String(err)}). Drop it in the Atlas UI if it exists.`);
    }
    process.exit(0);
  }

  const [withVector, marked, sizes] = await Promise.all([
    JobSeeker.countDocuments(HAS_VECTOR),
    JobSeeker.countDocuments({ searchVectorAt: { $exists: true } }),
    JobSeeker.aggregate([
      { $match: HAS_VECTOR },
      { $group: { _id: null, bytes: { $sum: { $bsonSize: { v: "$searchEmbedding" } } } } },
    ]) as Promise<Array<{ bytes: number }>>,
  ]);
  const dims = withVector * SEARCH_VECTOR_DIMS;
  out(`Mode: ${APPLY ? "APPLY (writing to Vectorize, marking profiles)" : "DRY RUN (nothing written)"}`);
  out(`Profiles with a search vector in Mongo: ${withVector} (already copied: ${marked})`);
  out(`Space --unset will free in Mongo: about ${((sizes[0]?.bytes ?? 0) / 1048576).toFixed(0)} MB`);
  out(`Vectorize storage: ${dims.toLocaleString("en-GB")} of the Free plan's ${FREE_STORED_DIMENSIONS.toLocaleString("en-GB")} dimensions (${Math.round((dims / FREE_STORED_DIMENSIONS) * 100)}%)`);
  if (dims > FREE_STORED_DIMENSIONS * 0.8) out("WARNING: over 80% of the free storage. Other Vectorize indexes (matching) will need Workers Paid.");

  const { copied, skipped } = await copy();
  out(`${APPLY ? "Copied" : "Would copy"} ${copied}; skipped ${skipped} (vector shorter than ${SEARCH_VECTOR_DIMS} or empty).`);
  out(APPLY ? "Next: --verify, then SEARCH_VECTOR_STORE=vectorize + redeploy, then --unset." : "Dry run only. Add --apply to copy.");
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
