/**
 * Migration: retire the job approval queue.
 *
 * Employers and agents publish jobs directly — nothing is routed to moderation
 * and the Job schema no longer carries the approval fields. Existing rows still
 * have the legacy shape, so bring them in line:
 *   - status "pending_approval"  -> "active"   (the poster intended to publish)
 *   - poster.approvalStatus      -> removed
 *   - approvedBy / approvedAt    -> removed
 *
 * Rows whose poster was "rejected" are handled like everyone else: the field is
 * dropped and the job keeps whatever `status` it has (rejection used to close
 * the job, so those stay closed). Use the admin jobs page to delete any you no
 * longer want.
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

await mongoose.connect(MONGODB_URI);
const jobs = mongoose.connection.collection("jobs");

const pendingStatus = await jobs.countDocuments({ status: "pending_approval" });
const legacyFields = await jobs.countDocuments({
  $or: [
    { "poster.approvalStatus": { $exists: true } },
    { approvedBy: { $exists: true } },
    { approvedAt: { $exists: true } },
  ],
});
console.log(`status=pending_approval: ${pendingStatus}`);
console.log(`rows with legacy approval fields: ${legacyFields}`);

if (APPLY) {
  const a = await jobs.updateMany({ status: "pending_approval" }, { $set: { status: "active" } });
  const b = await jobs.updateMany(
    {
      $or: [
        { "poster.approvalStatus": { $exists: true } },
        { approvedBy: { $exists: true } },
        { approvedAt: { $exists: true } },
      ],
    },
    { $unset: { "poster.approvalStatus": "", approvedBy: "", approvedAt: "" } },
  );
  console.log(`✅  status updated: ${a.modifiedCount}, legacy fields removed from: ${b.modifiedCount}`);
} else {
  console.log("ℹ️   Dry run — re-run with --apply to write.");
}

await mongoose.disconnect();
