import mongoose, { Document, Schema } from "mongoose";

/**
 * BackgroundCheck (FG-7)
 *
 * Tracks employer-initiated background and/or reference checks for a candidate
 * tied to a specific application. Reference contacts are stored inline with their
 * own response status so the employer can see which referees have replied.
 */

export type BackgroundCheckType = "background" | "reference" | "both";
export type BackgroundCheckStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";
export type BackgroundCheckOutcome = "clear" | "flagged" | "failed" | "pending";
export type ReferenceStatus = "pending" | "requested" | "responded" | "declined";

export interface IReferenceContact {
  name: string;
  relationship?: string;
  company?: string;
  email?: string;
  phone?: string;
  status: ReferenceStatus;
  feedback?: string;
  respondedAt?: Date;
}

export interface IBackgroundCheck extends Document {
  _id: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  checkType: BackgroundCheckType;
  status: BackgroundCheckStatus;
  outcome: BackgroundCheckOutcome;
  references: IReferenceContact[];
  backgroundNotes?: string;
  backgroundResults?: string;
  requestedAt: Date;
  completedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReferenceContactSchema = new Schema<IReferenceContact>(
  {
    name: { type: String, required: true },
    relationship: String,
    company: String,
    email: String,
    phone: String,
    status: {
      type: String,
      enum: ["pending", "requested", "responded", "declined"],
      default: "pending",
    },
    feedback: String,
    respondedAt: Date,
  },
  { _id: true }
);

const BackgroundCheckSchema = new Schema<IBackgroundCheck>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    jobSeekerId: {
      type: Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
    },
    employerId: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
    },
    checkType: {
      type: String,
      enum: ["background", "reference", "both"],
      default: "reference",
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "cancelled"],
      default: "pending",
    },
    outcome: {
      type: String,
      enum: ["clear", "flagged", "failed", "pending"],
      default: "pending",
    },
    references: { type: [ReferenceContactSchema], default: [] },
    backgroundNotes: String,
    backgroundResults: String,
    requestedAt: { type: Date, default: Date.now },
    completedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

BackgroundCheckSchema.index({ employerId: 1, createdAt: -1 });
BackgroundCheckSchema.index({ applicationId: 1 });
BackgroundCheckSchema.index({ jobSeekerId: 1 });

export const BackgroundCheck =
  mongoose.models.BackgroundCheck ||
  mongoose.model<IBackgroundCheck>("BackgroundCheck", BackgroundCheckSchema);
export default BackgroundCheck;
