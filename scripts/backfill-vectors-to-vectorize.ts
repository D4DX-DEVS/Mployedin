/**
 * Copy the matching vectors (Job / JobSeeker matchEmbedding, 1024-d) from
 * MongoDB to Cloudflare Vectorize through the mployedin-data Worker, remove the
 * ones whose document left the pool, and check the copy.
 * Plan: docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md part 3.
 *
 * Only vectors built by the current model (matchEmbeddingModel) are copied:
 * Vectorize must never mix models. Upserts replace by id, so a re-run is safe.
 * Mongo is only read.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/backfill-vectors-to-vectorize.ts          # dry run: counts + free-tier budget
 *   ... --apply             copy live vectors, delete departed ids
 *   ... --verify            query 20 copied vectors by id: each must come back as its own nearest match
 *
 * Order: deploy the Worker with the jobs-1024 / seekers-1024 indexes -> set
 * VECTOR_STORE=shadow and redeploy (new vectors now copy themselves) -> this
 * --apply -> this --verify -> watch the `vector_shadow` log overlap -> VECTOR_STORE=vectorize.
 */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { dataWorkerConfigured, deleteVectors, queryVectors, upsertVectors } from "@/lib/cloudflare/dataWorkerClient";
import { MATCH_EMBEDDING_DIMS, matchEmbeddingModel } from "@/lib/ai/openRouterEmbeddings";
import { DEPARTED_JOBS, DEPARTED_SEEKERS } from "@/lib/matching/vectorDepartures";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";

/** Vectorize Free stores 5M dimensions across every index of the account. */
const FREE_STORED_DIMENSIONS = 5_000_000;
const UPSERT_BATCH = 200;
const DELETE_BATCH = 1000;
const VERIFY_SAMPLE = 20;

const KINDS = [
  { kind: "job", index: "jobs", model: Job, live: { status: "active", deletedAt: null }, departed: DEPARTED_JOBS },
  { kind: "seeker", index: "seekers", model: JobSeeker, live: { roleArchivedAt: null }, departed: DEPARTED_SEEKERS },
] as const;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const VERIFY = args.includes("--verify");
const out = (line: string) => process.stdout.write(`${line}\n`);

type VectorDoc = { _id: unknown; matchEmbedding?: number[] };

async function copyKind(k: (typeof KINDS)[number], current: Record<string, unknown>): Promise<{ copied: number; departed: number }> {
  const model = k.model as unknown as typeof Job;
  let copied = 0;
  let batch: Array<{ id: string; values: number[] }> = [];
  const flush = async () => {
    if (batch.length && APPLY) copied += (await upsertVectors(k.index, batch)).upserted;
    else copied += batch.length;
    batch = [];
  };
  for await (const doc of model.find({ ...k.live, ...current }).select("+matchEmbedding").sort({ _id: 1 }).lean().cursor()) {
    const values = (doc as VectorDoc).matchEmbedding;
    if (!values || values.length !== MATCH_EMBEDDING_DIMS) continue;
    batch.push({ id: String((doc as VectorDoc)._id), values });
    if (batch.length >= UPSERT_BATCH) {
      await flush();
      process.stdout.write(`\r  ${k.index}: ${copied}`);
    }
  }
  await flush();
  process.stdout.write("\r");

  const departedIds = ((await model.find(k.departed).select("_id").lean()) as Array<{ _id: unknown }>).map((d) => String(d._id));
  if (APPLY) for (let i = 0; i < departedIds.length; i += DELETE_BATCH) await deleteVectors(k.index, departedIds.slice(i, i + DELETE_BATCH));
  return { copied, departed: departedIds.length };
}

async function verifyKind(k: (typeof KINDS)[number], current: Record<string, unknown>): Promise<boolean> {
  const model = k.model as unknown as typeof Job;
  const sample = (await model.aggregate([{ $match: { ...k.live, ...current } }, { $sample: { size: VERIFY_SAMPLE } }, { $project: { _id: 1 } }])) as Array<{
    _id: unknown;
  }>;
  let found = 0;
  for (const { _id } of sample) {
    const { matches } = await queryVectors(k.index, { id: String(_id), topK: 1 });
    if (matches[0]?.id === String(_id)) found++;
  }
  out(`  ${found === sample.length ? "OK  " : "DIFF"} ${k.index.padEnd(8)} ${found}/${sample.length} sampled vectors found in Vectorize`);
  return found === sample.length;
}

async function main(): Promise<void> {
  if (!dataWorkerConfigured()) {
    out("DATA_WORKER_URL / DATA_WORKER_SECRET are not set (workers/mployedin-data/README.md).");
    process.exit(1);
  }
  await connectDB();
  const current = { matchEmbeddingModel: matchEmbeddingModel() };

  if (VERIFY) {
    let ok = true;
    for (const k of KINDS) ok = (await verifyKind(k, current)) && ok;
    // Vectorize applies writes asynchronously: a fresh --apply can need a minute.
    out(ok ? "\nVectorize holds the sampled vectors." : "\nSome vectors are missing: wait a minute (writes apply asynchronously), then --apply / --verify again.");
    await mongoose.disconnect();
    process.exit(ok ? 0 : 2);
  }

  out(`Mode: ${APPLY ? "APPLY (writing to Vectorize)" : "DRY RUN (nothing written)"}; model ${current.matchEmbeddingModel}, ${MATCH_EMBEDDING_DIMS} dims`);
  let stored = 0;
  for (const k of KINDS) {
    const r = await copyKind(k, current);
    stored += r.copied;
    out(`  ${k.index.padEnd(8)} ${APPLY ? "copied" : "to copy"} ${String(r.copied).padStart(7)}   departed ids ${APPLY ? "deleted" : "to delete"} ${r.departed}`);
  }
  const dims = stored * MATCH_EMBEDDING_DIMS;
  out(`\nStored dimensions: ${dims.toLocaleString("en-GB")} of the Free plan's ${FREE_STORED_DIMENSIONS.toLocaleString("en-GB")} (${Math.round((dims / FREE_STORED_DIMENSIONS) * 100)}%).`);
  if (dims > FREE_STORED_DIMENSIONS * 0.8) out("WARNING: over 80% of the free storage: beyond it Vectorize bills (Workers Paid) or refuses writes (Free).");
  out(APPLY ? "Done. Now run with --verify." : "Dry run only. Add --apply to copy.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
