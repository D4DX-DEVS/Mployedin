/**
 * Migration: let a company hold more than one pending team invite.
 *
 * companyusers carried a unique SPARSE index on { companyId, userId }. Sparse
 * does not skip a compound key when one field (companyId) is present, so every
 * pending invite — which has no userId yet — was indexed under userId: null and
 * the second pending invite in a company failed with E11000.
 *
 * ensureIndexes() now builds `unique_claimed_member_per_company`, unique only
 * when userId is an ObjectId. This script builds that index (if the app has not
 * already) and then drops the old `companyId_1_userId_1`. The new index is built
 * FIRST so a claimed seat is never left without a uniqueness constraint.
 *
 * Dry-run by default. Pass `--apply` to write.
 * Requires MONGODB_URI (set in .env / .env.local or the shell).
 */
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  Missing MONGODB_URI environment variable");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const OLD = "companyId_1_userId_1";
const NEW = "unique_claimed_member_per_company";

await mongoose.connect(MONGODB_URI);
const users = mongoose.connection.collection("companyusers");

const indexes = await users.indexes();
const hasOld = indexes.some((i) => i.name === OLD);
const hasNew = indexes.some((i) => i.name === NEW);
console.log(`old sparse index ${OLD}: ${hasOld ? "present" : "absent"}`);
console.log(`new partial index ${NEW}: ${hasNew ? "present" : "absent"}`);

// The new index is weaker than the old one, so existing data cannot violate
// it — but report any duplicate claimed seats rather than assume.
const dupes = await users
  .aggregate([
    { $match: { userId: { $type: "objectId" } } },
    { $group: { _id: { companyId: "$companyId", userId: "$userId" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ])
  .toArray();
console.log(`duplicate claimed seats: ${dupes.length}`);
if (dupes.length) {
  console.error("❌  Resolve these duplicates first:", JSON.stringify(dupes));
  await mongoose.disconnect();
  process.exit(1);
}

if (APPLY) {
  if (!hasNew) {
    await users.createIndex(
      { companyId: 1, userId: 1 },
      { unique: true, partialFilterExpression: { userId: { $type: "objectId" } }, name: NEW },
    );
    console.log(`✅  built ${NEW}`);
  }
  if (hasOld) {
    await users.dropIndex(OLD);
    console.log(`✅  dropped ${OLD}`);
  }
} else {
  console.log("ℹ️   Dry run — re-run with --apply to write.");
}

await mongoose.disconnect();
