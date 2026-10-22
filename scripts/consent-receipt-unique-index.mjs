/**
 * Migration: one consent receipt per choice reference.
 *
 * The receipt route now upserts on `receiptId`, so a receipt the browser sends
 * again after a failed delivery is stored once. Until now a resend would have
 * stored it twice (the index was not unique), which inflates the admin's
 * Accept/Reject counts. This script makes the database match the model:
 *
 *   1. removes duplicate receipts, keeping the OLDEST per receiptId, and makes
 *      one more pass right before the build (a resend can land meanwhile);
 *   2. drops the old non-unique `receiptId_1` index;
 *   3. builds the unique `receiptId_1` index.
 *
 * Then the same for the account log (consentlogs): one row per account, choice
 * reference and category ({ userId, receiptId, consentType }, unique over rows
 * that have a reference), which the receipt route's exists-then-insert can't
 * guarantee alone.
 *
 * If a build still meets a duplicate (E11000), the plain index is put back, the
 * output says "RE-RUN THE SCRIPT", and the exit code is 1.
 *
 * The TTL index on createdAt is not touched. Safe to run more than once.
 *
 * DRY RUN BY DEFAULT: it only reads and reports. Pass `--apply` to write.
 * The owner runs it (a write to the shared Atlas cluster; the cluster must have
 * free space for the index first).
 *
 * Usage (MONGODB_URI in the environment, for example from your shell or
 * `node --env-file=.env scripts/consent-receipt-unique-index.mjs`):
 *   node scripts/consent-receipt-unique-index.mjs            # dry run
 *   node scripts/consent-receipt-unique-index.mjs --apply    # write
 */
import mongoose from "mongoose";
import { run, runConsentLogUniqueIndex } from "./lib/consentReceiptUniqueIndex.mjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI environment variable");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

await mongoose.connect(MONGODB_URI);
try {
  const log = (line) => console.log(line);
  console.log(APPLY ? "APPLY mode: writing." : "Dry run (read only).");
  console.log("== consentreceipts ==");
  const receipts = await run(mongoose.connection.collection("consentreceipts"), { apply: APPLY, log });
  console.log("== consentlogs ==");
  const logs = await runConsentLogUniqueIndex(mongoose.connection.collection("consentlogs"), { apply: APPLY, log });
  if (receipts.rerun || logs.rerun) {
    console.error("NOT FINISHED: a unique index was not built because a duplicate arrived during the run. RE-RUN THE SCRIPT with --apply.");
    process.exitCode = 1;
  }
} finally {
  await mongoose.disconnect();
}
