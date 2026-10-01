/**
 * Migration: retire saved-search alerts.
 *
 * The feature is gone — no page, API, model or hourly cron reads the
 * `savedsearches` collection any more, and seekers get job emails from their
 * profile instead. What is left is stored data: each row holds a seeker's
 * search text and location, so it should not outlive the feature (account
 * deletion no longer cascades into it). This drops the collection and its
 * indexes.
 *
 * Dry-run by default. Pass `--apply` to drop.
 * Requires MONGODB_URI (set in .env / .env.local or the shell).
 */
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  Missing MONGODB_URI environment variable");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;

const exists = (await db.listCollections({ name: "savedsearches" }).toArray()).length > 0;
if (!exists) {
  console.log("savedsearches: not present — nothing to do.");
} else {
  const col = db.collection("savedsearches");
  const total = await col.countDocuments();
  const users = (await col.distinct("userId")).length;
  const alertsOn = await col.countDocuments({ emailAlert: true });
  console.log(`savedsearches: ${total} rows from ${users} users (${alertsOn} with email alerts on)`);

  if (APPLY) {
    await col.drop();
    console.log("✅  savedsearches dropped");
  } else {
    console.log("ℹ️   Dry run — re-run with --apply to drop.");
  }
}

await mongoose.disconnect();
