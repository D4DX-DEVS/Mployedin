import mongoose, { Schema, Document, Model } from "mongoose";

/** One row per recompute: when it ran and what it saw. The admin page reads the latest. */
export interface IMarketGapSnapshot extends Document {
  generatedAt: Date;
  trigger: "cron" | "manual";
  seekersConsidered: number;
  noAreaCount: number;
  noRoleCount: number;
  activeJobs: number;
  /** Unplaced seekers per area, largest first (find_employers + thin_supply). */
  areas: { areaId?: mongoose.Types.ObjectId | null; name: string; seekers: number }[];
  durationMs: number;
}

const MarketGapSnapshotSchema = new Schema<IMarketGapSnapshot>(
  {
    generatedAt: { type: Date, required: true },
    trigger: { type: String, enum: ["cron", "manual"], default: "cron" },
    seekersConsidered: { type: Number, default: 0 },
    noAreaCount: { type: Number, default: 0 },
    noRoleCount: { type: Number, default: 0 },
    activeJobs: { type: Number, default: 0 },
    areas: { type: [{ _id: false, areaId: { type: Schema.Types.ObjectId, ref: "City" }, name: String, seekers: Number }], default: [] },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: false },
);

MarketGapSnapshotSchema.index({ generatedAt: -1 });
// Keep a year of runs.
MarketGapSnapshotSchema.index({ generatedAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

const MarketGapSnapshot: Model<IMarketGapSnapshot> =
  (mongoose.models.MarketGapSnapshot as Model<IMarketGapSnapshot>) ??
  mongoose.model<IMarketGapSnapshot>("MarketGapSnapshot", MarketGapSnapshotSchema);

export default MarketGapSnapshot;
