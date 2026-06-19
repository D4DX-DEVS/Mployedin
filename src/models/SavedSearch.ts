import mongoose, { Schema, Document, Types } from "mongoose";

export type SavedSearchFrequency = "instant" | "daily" | "weekly" | "never";

export interface ISavedSearchFilters {
  location?: string;
  jobType?: string;
  experienceLevel?: string;
  salary?: string;
}

export interface ISavedSearch extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  query: string;
  filters: ISavedSearchFilters;
  emailAlert: boolean;
  frequency: SavedSearchFrequency;
  /** Last time an alert email was sent (or the window was advanced). Drives dedup. */
  lastNotifiedAt?: Date;
  /** Number of new jobs in the most recent alert. */
  resultCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const SavedSearchSchema = new Schema<ISavedSearch>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    query: { type: String, required: true },
    filters: {
      location: String,
      jobType: String,
      experienceLevel: String,
      salary: String,
    },
    emailAlert: { type: Boolean, default: true },
    frequency: {
      type: String,
      enum: ["instant", "daily", "weekly", "never"],
      default: "weekly",
    },
    lastNotifiedAt: Date,
    resultCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Hot path: the saved-search-alerts cron selects due alerts by
// emailAlert + frequency + lastNotifiedAt. Index CREATION is centralized in
// lib/db/indexes.ts (autoIndex is disabled); declared here for documentation.
SavedSearchSchema.index({ emailAlert: 1, frequency: 1, lastNotifiedAt: 1 });

const SavedSearch =
  (mongoose.models.SavedSearch as mongoose.Model<ISavedSearch>) ||
  mongoose.model<ISavedSearch>("SavedSearch", SavedSearchSchema);

export default SavedSearch;
