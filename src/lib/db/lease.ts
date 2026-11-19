import mongoose, { Schema } from "mongoose";

/**
 * Short-lived, cross-process leases ("only one request may do X right now").
 *
 * Uniqueness rides on `_id`, which MongoDB always indexes — autoIndex is off
 * in this app, so a lease that depended on a separately-built unique index
 * would silently not exclude anything until someone ran the index script.
 *
 * Acquire = upsert a document whose lease has expired. If a live lease
 * exists, the filter misses, the upsert tries to insert the same `_id`, and
 * the duplicate-key error means someone else holds it.
 */

type LeaseDoc = { _id: string; expiresAt: Date };

const LeaseSchema = new Schema<LeaseDoc>(
  { _id: { type: String, required: true }, expiresAt: { type: Date, required: true } },
  { collection: "leases", versionKey: false },
);

const Lease: mongoose.Model<LeaseDoc> =
  (mongoose.models.Lease as mongoose.Model<LeaseDoc>) ?? mongoose.model<LeaseDoc>("Lease", LeaseSchema);

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/** True when this caller now holds `key` for `ttlMs`; false when someone else does. */
export async function acquireLease(key: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  try {
    await Lease.findOneAndUpdate(
      { _id: key, expiresAt: { $lte: now } },
      { $set: { expiresAt: new Date(now.getTime() + ttlMs) } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

/** Drop a lease early (e.g. when the guarded work failed and may be retried). */
export async function releaseLease(key: string): Promise<void> {
  await Lease.deleteOne({ _id: key });
}
