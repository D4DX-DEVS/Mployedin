/**
 * Cleanup: take "overdue" off invoices that owe nothing.
 *
 * Until 2026-11-24 the daily overdue job (api/cron/invoice-overdue) flagged
 * every past-due issued / sent / partially-paid invoice, including zero ones
 * such as free-plan renewals. Customers saw red "Overdue" badges on AED 0
 * invoices and admins got alerts for them. The job now skips invoices with
 * nothing owed; this script corrects the ones it already flagged:
 *   - something was paid and nothing is left  -> "paid"
 *   - nothing was billed and nothing was paid -> "issued" (as before the job)
 *
 * Dry-run by default: lists what it would change. Pass `--apply` to write.
 * Requires MONGODB_URI (set in .env / .env.local or the shell).
 */
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  Missing MONGODB_URI environment variable");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

const OWES_NOTHING = {
  status: "overdue",
  $or: [
    { balanceDue: { $lte: 0 } },
    { balanceDue: { $exists: false }, totalAmount: { $lte: 0 } },
  ],
};
const WAS_PAID = { paidAmount: { $gt: 0 } };
const NOTHING_PAID = { $or: [{ paidAmount: { $exists: false } }, { paidAmount: { $lte: 0 } }] };

await mongoose.connect(MONGODB_URI);
const invoices = mongoose.connection.collection("invoices");

const rows = await invoices
  .find(OWES_NOTHING)
  .project({ invoiceNumber: 1, category: 1, currency: 1, totalAmount: 1, paidAmount: 1, balanceDue: 1, dueDate: 1 })
  .sort({ dueDate: 1 })
  .toArray();

console.log(`Overdue invoices that owe nothing: ${rows.length}`);
for (const r of rows) {
  const next = (r.paidAmount ?? 0) > 0 ? "paid" : "issued";
  console.log(
    `  ${r.invoiceNumber ?? r._id}  ${r.category ?? "-"}  ${r.currency ?? "AED"} total ${r.totalAmount ?? 0}` +
      ` paid ${r.paidAmount ?? 0} due ${r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : "-"}  -> ${next}`,
  );
}

if (!APPLY) {
  console.log("\nDry run: nothing changed. Re-run with --apply to write.");
} else if (rows.length > 0) {
  // The filter is repeated in each update, so an invoice that picked up a
  // balance since the read above is left alone.
  const paid = await invoices.updateMany({ $and: [OWES_NOTHING, WAS_PAID] }, { $set: { status: "paid" } });
  const issued = await invoices.updateMany({ $and: [OWES_NOTHING, NOTHING_PAID] }, { $set: { status: "issued" } });
  console.log(`\nUpdated: ${paid.modifiedCount} -> paid, ${issued.modifiedCount} -> issued.`);
}

await mongoose.disconnect();
