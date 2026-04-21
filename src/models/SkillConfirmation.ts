import mongoose, { Document, Schema } from "mongoose";

export type SkillConfirmationStatus = "confirmed" | "denied" | "skipped";
export type SkillConfirmationSource = "job_view" | "feed" | "recommendation" | "skills_coach";

export interface ISkillConfirmation extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  skill: string;
  status: SkillConfirmationStatus;
  source: SkillConfirmationSource;
  jobId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SkillConfirmationSchema = new Schema<ISkillConfirmation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    skill: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
    status: {
      type: String,
      enum: ["confirmed", "denied", "skipped"],
      required: true,
    },
    source: {
      type: String,
      enum: ["job_view", "feed", "recommendation", "skills_coach"],
      default: "job_view",
    },
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
  },
  { timestamps: true },
);

// One response per skill per user
SkillConfirmationSchema.index({ userId: 1, skill: 1 }, { unique: true });
// Fast lookup for confirmed skills
SkillConfirmationSchema.index({ userId: 1, status: 1 });

export const SkillConfirmation =
  mongoose.models.SkillConfirmation ||
  mongoose.model<ISkillConfirmation>("SkillConfirmation", SkillConfirmationSchema);

export default SkillConfirmation;
