/**
 * Remove the old seed/test records that clog the agent dashboard queue
 * ("Needs your attention"): interviews held 30+ days ago with no outcome, and
 * agent tasks past their due date that are still open.
 *
 * Usage:
 *   node scripts/cleanup-stale-agent-queue.mjs          # report only (default)
 *   node scripts/cleanup-stale-agent-queue.mjs --apply  # delete them
 */
import "dotenv/config";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI not set");

await mongoose.connect(uri);
const db = mongoose.connection.db;
const now = new Date();
const cutoff = new Date(now.getTime() - 30 * 86_400_000);

const interviewFilter = {
  scheduledAt: { $lt: cutoff },
  outcome: { $in: [null, ""] },
  status: { $nin: ["cancelled", "rescheduled"] },
};
const taskFilter = {
  dueDate: { $ne: null, $lt: now },
  status: { $nin: ["completed", "failed"] },
};

const interviews = await db.collection("interviews").find(interviewFilter).project({ scheduledAt: 1, status: 1 }).toArray();
const tasks = await db.collection("agenttasks").find(taskFilter).project({ title: 1, dueDate: 1, userId: 1 }).toArray();

console.log(`Stale interviews: ${interviews.length}`);
for (const i of interviews) console.log(`  ${i._id}  ${i.scheduledAt?.toISOString?.().slice(0, 10)}  ${i.status}`);
console.log(`Overdue open tasks: ${tasks.length}`);
for (const t of tasks) console.log(`  ${t._id}  ${t.dueDate?.toISOString?.().slice(0, 10)}  ${t.title}`);

if (APPLY) {
  const a = await db.collection("interviews").deleteMany(interviewFilter);
  const b = await db.collection("agenttasks").deleteMany(taskFilter);
  console.log(`Deleted ${a.deletedCount} interviews, ${b.deletedCount} tasks.`);
} else {
  console.log("Report only. Re-run with --apply to delete.");
}
await mongoose.disconnect();
