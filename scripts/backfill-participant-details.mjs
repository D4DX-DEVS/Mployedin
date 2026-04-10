/**
 * One-time migration: backfill participantDetails in existing Conversations
 * with headline (from JobSeeker) and companyName (from Employer).
 *
 * Usage: node scripts/backfill-participant-details.mjs
 *
 * Safe to re-run — only updates conversations missing the new fields.
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
const userCollection = db.collection("users");
const jsCollection = db.collection("jobseekers");
const empCollection = db.collection("employers");

// Load lookup maps
const jobSeekers = await jsCollection
  .find({}, { projection: { userId: 1, headline: 1 } })
  .toArray();
const jsMap = new Map(
  jobSeekers.map((js) => [js.userId.toString(), js.headline ?? null])
);

const employers = await empCollection
  .find({}, { projection: { userId: 1, companyName: 1 } })
  .toArray();
const empMap = new Map(
  employers.map((e) => [e.userId.toString(), e.companyName ?? null])
);

console.log(
  `[Backfill] Loaded ${jsMap.size} job seekers, ${empMap.size} employers`
);

// Process conversations in batches
const BATCH_SIZE = 500;
const cursor = convCollection.find({});
let processed = 0;
let updated = 0;
let ops = [];

for await (const conv of cursor) {
  const details = conv.participantDetails ?? [];
  let changed = false;

  const newDetails = details.map((p) => {
    const uid = p.userId.toString();
    const copy = { ...p };

    if (p.role === "job_seeker" && !p.headline) {
      const headline = jsMap.get(uid);
      if (headline) {
        copy.headline = headline;
        changed = true;
      }
    }

    if (p.role === "employer" && !p.companyName) {
      const companyName = empMap.get(uid);
      if (companyName) {
        copy.companyName = companyName;
        changed = true;
      }
    }

    return copy;
  });

  if (changed) {
    ops.push({
      updateOne: {
        filter: { _id: conv._id },
        update: { $set: { participantDetails: newDetails } },
      },
    });
  }

  // Flush batch
  if (ops.length >= BATCH_SIZE) {
    const result = await convCollection.bulkWrite(ops);
    updated += result.modifiedCount;
    ops = [];
  }

  processed++;
}

// Flush remaining
if (ops.length > 0) {
  const result = await convCollection.bulkWrite(ops);
  updated += result.modifiedCount;
}

console.log(
  `[Backfill] Done. Processed: ${processed}, Updated: ${updated}`
);

await mongoose.disconnect();
