/**
 * Migration: put workflow stage ids onto the application-status vocabulary.
 *
 * The workflow editors used to write stage ids ("new", "screening",
 * "interview_completed", "offer_extended", "accepted") that never matched
 * `Application.status`, so auto-progress could not follow them. Bring every
 * stored list in line with src/lib/hiring/pipeline.ts:
 *   new                  -> applied
 *   screening            -> shortlisted
 *   interview_completed  -> selected
 *   offer_extended       -> offer
 *   accepted             -> hired
 * Duplicates that appear after remapping are merged (first by order wins),
 * unknown ids are dropped, `order` is renumbered, and — because the old
 * auto-progress flags targeted stages that never existed — autoProgress is
 * reset to false on every remapped list.
 *
 * Collections: employers.workflow.stages, jobs.workflow.stages,
 * workflowtemplates.stages.
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

const CANONICAL = new Set(["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"]);
const LEGACY = { new: "applied", screening: "shortlisted", interview_completed: "selected", offer_extended: "offer", accepted: "hired" };

function normalize(stages) {
  const seen = new Set();
  let remapped = false;
  const out = [];
  for (const stage of [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const id = CANONICAL.has(stage.id) ? stage.id : LEGACY[stage.id];
    if (!id) continue;
    if (id !== stage.id) remapped = true;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...stage, id });
  }
  return { remapped, stages: out.map((s, i) => ({ ...s, order: i + 1, autoProgress: remapped ? false : Boolean(s.autoProgress) })) };
}

function needsWork(stages) {
  return Array.isArray(stages) && stages.some((s) => !CANONICAL.has(s.id));
}

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection;

const targets = [
  { collection: "employers", path: "workflow.stages" },
  { collection: "jobs", path: "workflow.stages" },
  { collection: "workflowtemplates", path: "stages" },
];

for (const { collection, path } of targets) {
  const col = db.collection(collection);
  const cursor = col.find({ [path]: { $exists: true, $type: "array" } }, { projection: { [path]: 1 } });
  let scanned = 0;
  let changed = 0;
  for await (const doc of cursor) {
    scanned += 1;
    const stages = path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), doc);
    if (!needsWork(stages)) continue;
    const { stages: next } = normalize(stages);
    changed += 1;
    console.log(`${collection}/${doc._id}: ${stages.map((s) => s.id).join(",")} -> ${next.map((s) => s.id).join(",")}`);
    if (APPLY) await col.updateOne({ _id: doc._id }, { $set: { [path]: next } });
  }
  console.log(`${collection}: scanned ${scanned}, ${APPLY ? "updated" : "would update"} ${changed}`);
}

await mongoose.disconnect();
console.log(APPLY ? "✅  Applied." : "ℹ️  Dry run only. Re-run with --apply to write.");
