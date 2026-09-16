/**
 * One-time migration: drop the placeholder match breakdowns.
 *
 * Before the scoring fix, POST /api/ai/match persisted a hardcoded
 * `{ skills: 0, experience: 0, overall: <real score> }`. Those rows render as
 * "Skills 0% / Experience 0%" directly under an "85% Excellent" badge — two
 * figures that cannot both be true — and the UI treats an already-scored row
 * as done, so they never self-corrected.
 *
 * Clearing the placeholder (rather than guessing numbers for it) makes the
 * panel say the components were not recorded and offer a re-score, which
 * recomputes them deterministically. The headline score is left untouched: it
 * was always real.
 *
 * Usage:
 *   node scripts/backfill-clear-placeholder-match-breakdown.mjs           # dry run
 *   node scripts/backfill-clear-placeholder-match-breakdown.mjs --apply   # write
 *
 * Requires MONGODB_URI (set in .env / .env.local or the shell).
 */

import mongoose from "mongoose";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI environment variable");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

/**
 * A placeholder row: a real headline score, every recorded component zero.
 * A candidate who genuinely scored zero everywhere has aiMatchScore 0 too, so
 * the `$gt: 0` guard keeps those rows out of the migration.
 */
const PLACEHOLDER_QUERY = {
  aiMatchScore: { $gt: 0 },
  "matchBreakdown.skills": 0,
  "matchBreakdown.experience": 0,
  $and: [
    { $or: [{ "matchBreakdown.location": { $in: [null, 0] } }, { "matchBreakdown.location": { $exists: false } }] },
    { $or: [{ "matchBreakdown.salary": { $in: [null, 0] } }, { "matchBreakdown.salary": { $exists: false } }] },
  ],
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  const applications = mongoose.connection.collection("applications");

  const affected = await applications.countDocuments(PLACEHOLDER_QUERY);
  const scored = await applications.countDocuments({ aiMatchScore: { $gt: 0 } });
  console.log(`scored applications: ${scored}`);
  console.log(`placeholder breakdowns: ${affected}`);

  if (affected === 0) {
    console.log("nothing to do");
  } else if (!APPLY) {
    const sample = await applications
      .find(PLACEHOLDER_QUERY, { projection: { aiMatchScore: 1, matchBreakdown: 1 } })
      .limit(5)
      .toArray();
    for (const doc of sample) {
      console.log(`  ${doc._id}  score=${doc.aiMatchScore}  breakdown=${JSON.stringify(doc.matchBreakdown)}`);
    }
    console.log("\ndry run — re-run with --apply to clear these");
  } else {
    const res = await applications.updateMany(PLACEHOLDER_QUERY, { $unset: { matchBreakdown: "" } });
    console.log(`cleared ${res.modifiedCount} placeholder breakdowns`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
