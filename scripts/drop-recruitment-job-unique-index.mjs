/**
 * Migration: let one job have several open recruitment invoices, one per hire.
 *
 * invoices carried `unique_active_recruitment_invoice_per_job_employer`, a
 * partial unique index on { category, jobId, employerId } for open recruitment
 * invoices. Owner decision D1 (docs/plans/2026-11-24-agent-invoice-hires-target.md)
 * replaced that rule with "a hire is billed on one open invoice only", enforced
 * in lib/invoices/hireBilling.ts. While the index exists, a second invoice for
 * the same job still fails with E11000 (the API answers 409).
 *
 * This script builds the plain lookup index `recruitment_invoices_by_job` first
 * (so job lookups never lose their index), then drops the unique one. It also
 * reports hires already billed on two open invoices — none should exist.
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
const OLD = "unique_active_recruitment_invoice_per_job_employer";
const NEW = "recruitment_invoices_by_job";
const TERMINAL = ["void", "cancelled", "refunded", "credit_note"];

await mongoose.connect(MONGODB_URI);
const invoices = mongoose.connection.collection("invoices");

const indexes = await invoices.indexes();
const hasOld = indexes.some((i) => i.name === OLD);
const hasNew = indexes.some((i) => i.name === NEW);
console.log(`old unique index ${OLD}: ${hasOld ? "present" : "absent"}`);
console.log(`new lookup index ${NEW}: ${hasNew ? "present" : "absent"}`);

const doubleBilled = await invoices
  .aggregate([
    { $match: { category: "recruitment", status: { $nin: TERMINAL } } },
    { $unwind: "$lineItems" },
    { $match: { "lineItems.placementId": { $type: "objectId" } } },
    { $group: { _id: "$lineItems.placementId", invoices: { $addToSet: "$invoiceNumber" } } },
    { $match: { "invoices.1": { $exists: true } } },
  ])
  .toArray();
console.log(`hires on more than one open invoice: ${doubleBilled.length}`);
if (doubleBilled.length) console.log(JSON.stringify(doubleBilled, null, 2));

if (APPLY) {
  if (!hasNew) {
    await invoices.createIndex({ category: 1, jobId: 1, employerId: 1, status: 1 }, { name: NEW });
    console.log(`✅  built ${NEW}`);
  }
  if (hasOld) {
    await invoices.dropIndex(OLD);
    console.log(`✅  dropped ${OLD}`);
  }
} else {
  console.log("ℹ️   Dry run — re-run with --apply to write.");
}

await mongoose.disconnect();
