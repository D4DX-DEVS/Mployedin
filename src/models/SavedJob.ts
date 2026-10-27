import mongoose, { Document, Schema } from "mongoose";

/**
 * A job a seeker bookmarked to come back to. Removed 2026-09-08, restored
 * 2026-10-27 on the client's request ("save job option in every job, and a
 * saved jobs page"); the old `savedjobs` collection is reused as it was.
 */
export interface ISavedJob extends Document {
  _id: mongoose.Types.ObjectId;
  /** JobSeeker PROFILE _id, not the User id. */
  jobSeekerId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  savedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SavedJobSchema = new Schema<ISavedJob>(
  {
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "JobSeeker", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SavedJobSchema.index({ jobSeekerId: 1, jobId: 1 }, { unique: true });
SavedJobSchema.index({ jobSeekerId: 1, savedAt: -1 });

export const SavedJob =
  (mongoose.models.SavedJob as mongoose.Model<ISavedJob>) ||
  mongoose.model<ISavedJob>("SavedJob", SavedJobSchema);
export default SavedJob;
