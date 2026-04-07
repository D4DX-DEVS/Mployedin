import mongoose, { Document, Schema } from "mongoose";

export type ActivityEventType =
  | "job_match"
  | "profile_view"
  | "application_update"
  | "general";

export const ACTIVITY_PRIORITY: Record<ActivityEventType, number> = {
  job_match: 3,
  profile_view: 2,
  application_update: 1,
  general: 0,
};

export interface IActivityEvent extends Document {
  _id: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  type: ActivityEventType;
  metadata: Record<string, unknown>;
  priority: number;
  createdAt: Date;
}

const ActivityEventSchema = new Schema<IActivityEvent>(
  {
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "JobSeeker", required: true, index: true },
    type: {
      type: String,
      enum: ["job_match", "profile_view", "application_update", "general"],
      required: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    priority: { type: Number, default: 0, min: 0, max: 3, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ActivityEventSchema.index({ jobSeekerId: 1, createdAt: -1 });
ActivityEventSchema.index({ jobSeekerId: 1, priority: -1, createdAt: -1 });

export const ActivityEvent =
  mongoose.models.ActivityEvent ||
  mongoose.model<IActivityEvent>("ActivityEvent", ActivityEventSchema);

export default ActivityEvent;
