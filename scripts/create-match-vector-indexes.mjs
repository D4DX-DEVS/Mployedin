/**
 * Create the Atlas Vector Search indexes for matching vectors (Part 5).
 *
 *   node --env-file=.env scripts/create-match-vector-indexes.mjs           # dry run: shows what it would do
 *   node --env-file=.env scripts/create-match-vector-indexes.mjs --apply   # creates missing indexes
 *
 * Idempotent: an index that already exists is reported, never rebuilt. Run
 * scripts/atlas-capacity-check.mjs first (owner decision O2): on the shared
 * M0 cluster a full quota blocks every write, logins included.
 */
import mongoose from "mongoose";

const DIMENSIONS = 1024; // MATCH_EMBEDDING_DIMS in src/lib/ai/openRouterEmbeddings.ts
const APPLY = process.argv.includes("--apply");

const INDEXES = [
  { collection: "jobs", name: "job_match_vector_index", filter: "status" },
  { collection: "jobseekers", name: "jobseeker_match_vector_index", filter: "profileVisibility" },
];

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env scripts/create-match-vector-indexes.mjs");
  process.exit(1);
}

await mongoose.connect(uri);
try {
  for (const spec of INDEXES) {
    const col = mongoose.connection.collection(spec.collection);
    const existing = (await col.listSearchIndexes().toArray()).find((i) => i.name === spec.name);
    if (existing) {
      console.log(`${spec.name}: exists (status ${existing.status}, queryable ${existing.queryable})`);
      continue;
    }
    const definition = {
      fields: [
        { type: "vector", path: "matchEmbedding", numDimensions: DIMENSIONS, similarity: "cosine" },
        { type: "filter", path: spec.filter },
      ],
    };
    if (!APPLY) {
      console.log(`${spec.name}: would create on ${spec.collection}`, JSON.stringify(definition));
      continue;
    }
    await col.createSearchIndex({ name: spec.name, type: "vectorSearch", definition });
    console.log(`${spec.name}: creation requested on ${spec.collection}`);
  }

  if (APPLY) {
    // Poll until both are queryable (about a minute each), at most ~3 minutes.
    for (let i = 0; i < 36; i++) {
      const states = await Promise.all(
        INDEXES.map(async (spec) => {
          const idx = (await mongoose.connection.collection(spec.collection).listSearchIndexes().toArray()).find(
            (x) => x.name === spec.name,
          );
          return { name: spec.name, queryable: Boolean(idx?.queryable), status: idx?.status ?? "unknown" };
        }),
      );
      console.log(states.map((s) => `${s.name}=${s.status}`).join("  "));
      if (states.every((s) => s.queryable)) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
  } else {
    console.log("Dry run. Re-run with --apply to create the missing indexes.");
  }
} finally {
  await mongoose.disconnect();
}
