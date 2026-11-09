import mongoose, { Schema, Document, Model } from "mongoose";

export type MarketSuggestionStatus = "new" | "assigned" | "done" | "dismissed" | "resolved";

export interface IMarketSuggestionHistory {
  at: Date;
  action: "seen" | "assigned" | "done" | "dismissed" | "reopened" | "resolved";
  by?: mongoose.Types.ObjectId | null;
  note?: string;
}

/**
 * One marketing suggestion for the admin, kept across nightly recomputes.
 * `key` is stable (kind + area + kind of work), so status and history survive
 * a rebuild; the numbers are overwritten each run.
 */
export interface IMarketSuggestion extends Document {
  key: string;
  kind: "find_employers" | "thin_supply" | "find_seekers" | "fix_data";
  areaId?: mongoose.Types.ObjectId | null;
  areaName: string;
  /** Super agent (user id) whose territory holds the area, when one does. */
  saUserId?: mongoose.Types.ObjectId | null;
  saName: string;
  roleKey: string;
  role: string;
  seekers: number;
  jobs: number;
  priority: "high" | "medium" | "low";
  topSkills: { skill: string; count: number }[];
  medianWaitDays: number;
  sampleSeekerIds: mongoose.Types.ObjectId[];
  /** Seeker counts from recent runs, oldest first, for the trend. */
  trend: { at: Date; seekers: number; jobs: number }[];
  status: MarketSuggestionStatus;
  history: IMarketSuggestionHistory[];
  assignedTo?: mongoose.Types.ObjectId | null;
  taskId?: mongoose.Types.ObjectId | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

const MarketSuggestionSchema = new Schema<IMarketSuggestion>(
  {
    key: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["find_employers", "thin_supply", "find_seekers", "fix_data"], required: true },
    areaId: { type: Schema.Types.ObjectId, ref: "City", default: null },
    areaName: { type: String, default: "" },
    saUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    saName: { type: String, default: "" },
    roleKey: { type: String, default: "" },
    role: { type: String, default: "" },
    seekers: { type: Number, default: 0 },
    jobs: { type: Number, default: 0 },
    priority: { type: String, enum: ["high", "medium", "low"], default: "low" },
    topSkills: { type: [{ _id: false, skill: String, count: Number }], default: [] },
    medianWaitDays: { type: Number, default: 0 },
    sampleSeekerIds: { type: [Schema.Types.ObjectId], default: [] },
    trend: { type: [{ _id: false, at: Date, seekers: Number, jobs: Number }], default: [] },
    status: { type: String, enum: ["new", "assigned", "done", "dismissed", "resolved"], default: "new" },
    history: {
      type: [
        {
          _id: false,
          at: Date,
          action: { type: String, enum: ["seen", "assigned", "done", "dismissed", "reopened", "resolved"] },
          by: { type: Schema.Types.ObjectId, ref: "User", default: null },
          note: String,
        },
      ],
      default: [],
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    taskId: { type: Schema.Types.ObjectId, ref: "AgentTask", default: null },
    firstSeenAt: { type: Date, default: () => new Date() },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);

MarketSuggestionSchema.index({ status: 1, priority: 1, seekers: -1 });
MarketSuggestionSchema.index({ saUserId: 1, status: 1 });
MarketSuggestionSchema.index({ areaId: 1 });

const MarketSuggestion: Model<IMarketSuggestion> =
  (mongoose.models.MarketSuggestion as Model<IMarketSuggestion>) ??
  mongoose.model<IMarketSuggestion>("MarketSuggestion", MarketSuggestionSchema);

export default MarketSuggestion;
