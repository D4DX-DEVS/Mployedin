import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * One row per AI provider call (or cache hit), kept 180 days.
 *
 * Unlike AiDailyUsage (a per-user counter that expires after a day) this keeps
 * who, what, which model, how many tokens and what it cost, so an admin can
 * trace any total back to individual calls. Totals are read from
 * AiUsageMonthly; this collection is for drill-down and verification.
 */
export interface IAiUsageLog extends Document {
  at: Date;
  /** The person who triggered the call (the real actor, not a tenant-view proxy). */
  userId?: mongoose.Types.ObjectId | null;
  role: string;
  /** Employer the call was for or made by; null for seekers and own staff work. */
  employerId?: mongoose.Types.ObjectId | null;
  /** True when staff (agent / super agent / admin) acted for an employer. */
  onBehalf: boolean;
  feature: string;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** False when the model has no known price, so costUsd (0) is not a real zero. */
  priced: boolean;
  cacheHit: boolean;
  ok: boolean;
  latencyMs?: number;
  route?: string;
  expiresAt: Date;
}

const AiUsageLogSchema = new Schema<IAiUsageLog>(
  {
    at: { type: Date, required: true, default: () => new Date() },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    role: { type: String, required: true, default: "system" },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", default: null },
    onBehalf: { type: Boolean, default: false },
    feature: { type: String, required: true, default: "other" },
    provider: { type: String, default: "other" },
    modelId: { type: String, default: "unknown" },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    priced: { type: Boolean, default: true },
    cacheHit: { type: Boolean, default: false },
    ok: { type: Boolean, default: true },
    latencyMs: Number,
    route: String,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false },
);

AiUsageLogSchema.index({ employerId: 1, at: -1 });
AiUsageLogSchema.index({ userId: 1, at: -1 });
AiUsageLogSchema.index({ at: -1 });
AiUsageLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AiUsageLog: Model<IAiUsageLog> =
  (mongoose.models.AiUsageLog as Model<IAiUsageLog>) ??
  mongoose.model<IAiUsageLog>("AiUsageLog", AiUsageLogSchema);

export default AiUsageLog;
