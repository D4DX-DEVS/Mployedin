import mongoose, { Schema, type Document } from "mongoose";

/**
 * One Jev verdict, keyed on a hash of the exact input it answered.
 *
 * Jev is called fresh on every request, so the same seeker/job pair could read
 * one percentage in the morning email and another on the next page view — and
 * every page load paid again for a decision already bought. Storing the verdict
 * against its input makes the number stable across email, app and employer
 * view, and makes it stale automatically: change a skill on either side and the
 * key changes with it.
 *
 * Indexes are declared in lib/db/indexes.ts, not here — see `jevverdicts` there.
 */
export interface IJevVerdict extends Document {
  /** sha256 of { model, questions, state } — see jevVerdictStore.ts. */
  key: string;
  /** Jev's genuine-fit probability, 0..1. */
  fit: number;
  expiresAt: Date;
  createdAt: Date;
}

const JevVerdictSchema = new Schema<IJevVerdict>(
  {
    key: { type: String, required: true },
    fit: { type: Number, required: true, min: 0, max: 1 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const JevVerdict =
  (mongoose.models.JevVerdict as mongoose.Model<IJevVerdict>) ||
  mongoose.model<IJevVerdict>("JevVerdict", JevVerdictSchema);

export default JevVerdict;
