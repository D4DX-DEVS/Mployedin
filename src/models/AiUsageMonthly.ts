import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Monthly rollup of AiUsageLog, one row per (month, scope, owner, feature).
 *
 *   scope "employer" → refId is the Employer; every call made by or for them.
 *   scope "user"     → refId is the User who made the call; `role` says whether
 *                      that was a seeker, agent, super agent or admin.
 *
 * Updated with `$inc` as each call is logged, so the admin pages read a few
 * hundred small rows instead of scanning the raw log.
 */
export interface IAiUsageMonthly extends Document {
  /** UTC `YYYY-MM` */
  month: string;
  scope: "employer" | "user";
  refId: mongoose.Types.ObjectId;
  /** Role of the user (scope "user" only). */
  role?: string;
  feature: string;
  calls: number;
  failed: number;
  cacheHits: number;
  unpriced: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Scope "user": spend made for employers rather than on their own work. */
  behalfCalls: number;
  behalfCostUsd: number;
  /** Scope "user": employers they acted for this month. */
  employerIds: mongoose.Types.ObjectId[];
}

const AiUsageMonthlySchema = new Schema<IAiUsageMonthly>(
  {
    month: { type: String, required: true },
    scope: { type: String, enum: ["employer", "user"], required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    role: String,
    feature: { type: String, required: true },
    calls: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    cacheHits: { type: Number, default: 0 },
    unpriced: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    behalfCalls: { type: Number, default: 0 },
    behalfCostUsd: { type: Number, default: 0 },
    employerIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: false },
);

AiUsageMonthlySchema.index({ month: 1, scope: 1, refId: 1, feature: 1 }, { unique: true });
AiUsageMonthlySchema.index({ month: 1, scope: 1, role: 1 });

const AiUsageMonthly: Model<IAiUsageMonthly> =
  (mongoose.models.AiUsageMonthly as Model<IAiUsageMonthly>) ??
  mongoose.model<IAiUsageMonthly>("AiUsageMonthly", AiUsageMonthlySchema);

export default AiUsageMonthly;
