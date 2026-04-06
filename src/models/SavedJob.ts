import mongoose, { Document, Schema } from "mongoose";

export interface ISavedJob extends Document {
  _id: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  notes?: string;
  savedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SavedJobSchema = new Schema<ISavedJob>(
  {
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    notes: { type: String, maxlength: 500 },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SavedJobSchema.index({ jobSeekerId: 1, jobId: 1 }, { unique: true });
SavedJobSchema.index({ jobSeekerId: 1, savedAt: -1 });

export const SavedJob =
  mongoose.models.SavedJob ||
  mongoose.model<ISavedJob>("SavedJob", SavedJobSchema);
export default SavedJob;
