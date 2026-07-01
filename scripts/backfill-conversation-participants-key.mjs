/**
 * One-time migration: backfill participantsKey on existing dm Conversations
 * (sorted participant ObjectIds joined by ":"), so the new unique_dm_pair
 * partial index (lib/db/indexes.ts) can build cleanly. Also materializes an
 * explicit `type: "dm"` on legacy docs that predate the field, since the
 * partial index's filter only matches a literal stored value, not the
 * mongoose schema default.
 *
 * Usage: node scripts/backfill-conversation-participants-key.mjs
 *
 * Safe to re-run — only updates conversations missing participantsKey.
 * Reports any duplicate pairs found (same participantsKey) instead of
 * silently overwriting — those need manual review (merge/delete) before
 * the unique index can build.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log("[Backfill] Connected to MongoDB");

const db = mongoose.connection.db;
const convCollection = db.collection("conversations");

// type is "dm" or missing (schema default is "dm" for legacy docs)
const cursor = convCollection.find({
  $and: [
    { $or: [{ type: "dm" }, { type: { $exists: false } }] },
    { participantsKey: { $exists: false } },
  ],
});

const BATCH_SIZE = 500;
let processed = 0;
let updated = 0;
let ops = [];
const seenKeys = new Map(); // key -> [conversationId, ...]

for await (const conv of cursor) {
  processed++;
  const ids = (conv.participants ?? []).map((p) => p.toString());
  if (ids.length !== 2) {
    console.warn(`[Backfill] Skipping ${conv._id}: expected 2 participants, got ${ids.length}`);
    continue;
  }
  const key = [...ids].sort().join(":");

  const existing = seenKeys.get(key) ?? [];
  existing.push(conv._id.toString());
  seenKeys.set(key, existing);

  // The unique_dm_pair index's partialFilterExpression matches on a literal
  // stored `type: "dm"` field — the mongoose schema default doesn't get
  // written to legacy docs saved before the field existed, so those need
  // `type` materialized here or the index silently won't cover them.
  const set = { participantsKey: key };
  if (conv.type === undefined) set.type = "dm";

  ops.push({
    updateOne: {
      filter: { _id: conv._id },
      update: { $set: set },
    },
  });

  if (ops.length >= BATCH_SIZE) {
    const result = await convCollection.bulkWrite(ops);
    updated += result.modifiedCount;
    ops = [];
  }
}

if (ops.length > 0) {
  const result = await convCollection.bulkWrite(ops);
  updated += result.modifiedCount;
}

const duplicates = [...seenKeys.entries()].filter(([, ids]) => ids.length > 1);

console.log(`[Backfill] Done. Processed: ${processed}, Updated: ${updated}`);
if (duplicates.length > 0) {
  console.warn(
    `[Backfill] WARNING: ${duplicates.length} duplicate dm pair(s) found — the unique_dm_pair index ` +
      `will fail to build until these are merged/resolved manually:`
  );
  for (const [key, ids] of duplicates) {
    console.warn(`  ${key}: ${ids.join(", ")}`);
  }
}

await mongoose.disconnect();
