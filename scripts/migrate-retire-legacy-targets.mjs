/**
 * Migration: retire the employer / employee / finance target profiles.
 *
 * Targets now have one aim, company profit (`targetType: "profit"`). The old
 * "finance" number was agent commission — a cost, not income — so old profiles
 * are not converted: they are cancelled and admin sets profit targets again.
 * Cancelling also frees the unique "one active profile per person per year"
 * slot, which would otherwise block creating the new profile.
 *
 * Touches only profiles with no `targetType`. No notifications are sent.
 * Dry-run by default. Pass `--apply` to cancel.
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

const exists = (await db.listCollections({ name: "targetprofiles" }).toArray()).length > 0;
if (!exists) {
  console.log("targetprofiles: not present — nothing to do.");
} else {
  const col = db.collection("targetprofiles");
  const legacy = { targetType: { $exists: false } };
  const total = await col.countDocuments(legacy);
  const active = await col.countDocuments({ ...legacy, status: "active" });
  console.log(`targetprofiles: ${total} retired-format profiles (${active} active)`);

  if (!APPLY) {
    console.log("ℹ️   Dry run — re-run with --apply to cancel the active ones.");
  } else {
    const result = await col.updateMany(
      { ...legacy, status: "active" },
      { $set: { status: "cancelled" } },
    );
    console.log(`✅  ${result.modifiedCount} active profiles cancelled`);
  }
}

await mongoose.disconnect();
