/**
 * Migration: retire the job approval queue.
 *
 * Employers now publish jobs directly — nothing is ever routed to moderation.
 * Existing rows still carry the legacy shape, so flip them:
 *   - status "pending_approval"        -> "active"
 *   - poster.approvalStatus "pending"  -> "approved"
 *
 * Rejected posters are left alone: they were deliberately taken down, and the
 * new model has no "rejected" state to honour. Delete them from the admin jobs
 * page instead.
 *
 * Dry-run by default. Pass `--apply` to write.
 * Requires MONGODB_URI (set in .env.local or the shell).
 */
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  Missing MONGODB_URI environment variable");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

await mongoose.connect(MONGODB_URI);
const jobs = mongoose.connection.collection("jobs");

const pendingStatus = await jobs.countDocuments({ status: "pending_approval" });
const pendingPoster = await jobs.countDocuments({ "poster.approvalStatus": "pending" });
console.log(`status=pending_approval: ${pendingStatus}`);
console.log(`poster.approvalStatus=pending: ${pendingPoster}`);

if (APPLY) {
  const a = await jobs.updateMany({ status: "pending_approval" }, { $set: { status: "active" } });
  const b = await jobs.updateMany({ "poster.approvalStatus": "pending" }, { $set: { "poster.approvalStatus": "approved" } });
  console.log(`✅  status updated: ${a.modifiedCount}, approvalStatus updated: ${b.modifiedCount}`);
} else {
  console.log("ℹ️   Dry run — re-run with --apply to write.");
}

await mongoose.disconnect();
