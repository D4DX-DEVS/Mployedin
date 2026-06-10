/**
 * Create the Atlas Vector Search index used by /api/job-seekers/vector-search.
 *
 * Usage:
 *   node --env-file=.env scripts/create-vector-search-index.mjs
 *
 * Idempotent — skips creation if the index already exists.
 * Requires a MongoDB Atlas cluster (M0+ supports vector search indexes).
 */

import mongoose from "mongoose";

const INDEX_NAME = "jobseeker_vector_index";
const DIMENSIONS = 3072; // google/gemini-embedding-001

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("❌  MONGODB_URI is not set. Run: node --env-file=.env scripts/create-vector-search-index.mjs");
  process.exit(1);
}

await mongoose.connect(uri);
const col = mongoose.connection.collection("jobseekers");

const existing = await col.listSearchIndexes().toArray();
if (existing.some((i) => i.name === INDEX_NAME)) {
  console.log(`✅  Index "${INDEX_NAME}" already exists:`, existing.find((i) => i.name === INDEX_NAME).status);
} else {
  await col.createSearchIndex({
    name: INDEX_NAME,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "searchEmbedding", numDimensions: DIMENSIONS, similarity: "cosine" },
        { type: "filter", path: "status" },
      ],
    },
  });
  console.log(`🚀  Index "${INDEX_NAME}" creation requested (takes ~1 min to become queryable).`);
}

// Poll until READY (max ~2 min)
for (let i = 0; i < 24; i++) {
  const idx = (await col.listSearchIndexes().toArray()).find((x) => x.name === INDEX_NAME);
  console.log(`   status: ${idx?.status ?? "unknown"} queryable: ${idx?.queryable ?? false}`);
  if (idx?.queryable) break;
  await new Promise((r) => setTimeout(r, 5000));
}

await mongoose.disconnect();
