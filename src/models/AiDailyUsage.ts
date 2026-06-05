import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Per-user daily AI usage counter.
 *
 * One document per (userId, day) where `day` is a UTC `YYYY-MM-DD` string.
 * Backed by MongoDB so the cap holds across serverless cold starts (no Redis
 * required). A TTL index auto-deletes rows shortly after the day ends.
 */
export interface IAiDailyUsage extends Document {
  userId: mongoose.Types.ObjectId;
  /** UTC calendar day, e.g. "2026-06-04" */
  day: string;
  count: number;
  /** TTL anchor — set to just after the day ends. */
  expiresAt: Date;
}

const AiDailyUsageSchema = new Schema<IAiDailyUsage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false },
);

// One counter per user per day (also makes the atomic upsert race-safe).
AiDailyUsageSchema.index({ userId: 1, day: 1 }, { unique: true });
// TTL — MongoDB auto-deletes expired counters.
AiDailyUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AiDailyUsage: Model<IAiDailyUsage> =
  (mongoose.models.AiDailyUsage as Model<IAiDailyUsage>) ??
  mongoose.model<IAiDailyUsage>("AiDailyUsage", AiDailyUsageSchema);

export default AiDailyUsage;
