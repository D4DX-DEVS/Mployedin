/**
 * Backfill for the three-pillar targets (docs/plans/2026-11-18-target-management-v2.md).
 *
 * 1. Jobs that went live before the stamps existed get
 *      firstPublishedAt  = createdAt (no publish history is kept),
 *      acquiredByAgentId = job.agentId, else the employer's agent.
 *    Caveat: open jobs whose employer was reassigned already carry the new
 *    agent, so their credit goes to the new agent. Closed jobs never moved.
 * 2. Closed/expired jobs get closedAt = updatedAt (the closest stored date).
 * 3. Invoice lines without a hire link get one only when it is certain: the
 *    line's job has exactly one placement and only one line on the invoice bills
 *    that job. Everything else stays unlinked for an admin to link from
 *    /admin/invoices (Needs attention → Not linked to a hire).
 *
 * Idempotent: only fills empty fields. Dry run by default; pass --apply to write.
 * Requires MONGODB_URI. NOTE: the local .env points at the shared staging DB.
 */
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI environment variable");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;
const jobs = db.collection("jobs");
const employers = db.collection("employers");
const invoices = db.collection("invoices");
const placements = db.collection("placements");

// ── 1. first publish + acquisition credit ────────────────────────────────
const published = await jobs
  .find(
    { status: { $in: ["active", "paused", "closed", "expired"] }, firstPublishedAt: { $exists: false } },
    { projection: { _id: 1, agentId: 1, employerId: 1, createdAt: 1 } },
  )
  .toArray();
const employerIds = [...new Set(published.filter((j) => !j.agentId && j.employerId).map((j) => String(j.employerId)))];
const employerAgent = new Map(
  (await employers
    .find({ _id: { $in: employerIds.map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { agentId: 1 } })
    .toArray()).map((e) => [String(e._id), e.agentId ?? null]),
);
const publishOps = published.map((j) => {
  const agent = j.agentId ?? employerAgent.get(String(j.employerId)) ?? null;
  const set = { firstPublishedAt: j.createdAt ?? new Date() };
  if (agent) set.acquiredByAgentId = agent;
  return { updateOne: { filter: { _id: j._id, firstPublishedAt: { $exists: false } }, update: { $set: set } } };
});
const noAgent = publishOps.filter((op) => !op.updateOne.update.$set.acquiredByAgentId).length;
console.log(`jobs: ${publishOps.length} published jobs to stamp (${noAgent} with no agent — counted for nobody)`);

// ── 2. closedAt ──────────────────────────────────────────────────────────
const closedFilter = { status: { $in: ["closed", "expired"] }, closedAt: { $exists: false } };
const closedCount = await jobs.countDocuments(closedFilter);
console.log(`jobs: ${closedCount} closed/expired jobs to give closedAt = updatedAt`);

// ── 3. invoice line → hire ───────────────────────────────────────────────
const recruitment = await invoices
  .find({ category: "recruitment" }, { projection: { _id: 1, jobId: 1, lineItems: 1 } })
  .toArray();
const lineJobIds = new Set();
for (const inv of recruitment) {
  for (const li of inv.lineItems ?? []) {
    const jobId = li.jobId ?? inv.jobId;
    if (!li.placementId && jobId) lineJobIds.add(String(jobId));
  }
}
const byJob = new Map();
for (const p of await placements
  .find({ jobId: { $in: [...lineJobIds].map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { _id: 1, jobId: 1 } })
  .toArray()) {
  const key = String(p.jobId);
  byJob.set(key, [...(byJob.get(key) ?? []), p._id]);
}
let linkable = 0;
let unlinked = 0;
const invoiceOps = [];
for (const inv of recruitment) {
  const lines = inv.lineItems ?? [];
  const perJob = new Map();
  for (const li of lines) {
    const jobId = String(li.jobId ?? inv.jobId ?? "");
    perJob.set(jobId, (perJob.get(jobId) ?? 0) + 1);
  }
  let changed = false;
  const next = lines.map((li) => {
    if (li.placementId) return li;
    const jobId = String(li.jobId ?? inv.jobId ?? "");
    const hires = byJob.get(jobId) ?? [];
    if (hires.length === 1 && perJob.get(jobId) === 1) {
      linkable += 1;
      changed = true;
      return { ...li, placementId: hires[0] };
    }
    unlinked += 1;
    return li;
  });
  if (changed) invoiceOps.push({ updateOne: { filter: { _id: inv._id }, update: { $set: { lineItems: next } } } });
}
console.log(`invoice lines: ${linkable} can be linked for certain, ${unlinked} stay unlinked (admin links them)`);

if (!APPLY) {
  console.log("Dry run — re-run with --apply to write.");
} else {
  if (publishOps.length) console.log(`jobs stamped: ${(await jobs.bulkWrite(publishOps)).modifiedCount}`);
  if (closedCount) {
    const r = await jobs.updateMany(closedFilter, [{ $set: { closedAt: "$updatedAt" } }]);
    console.log(`jobs closedAt set: ${r.modifiedCount}`);
  }
  if (invoiceOps.length) console.log(`invoices linked: ${(await invoices.bulkWrite(invoiceOps)).modifiedCount}`);
}

await mongoose.disconnect();
