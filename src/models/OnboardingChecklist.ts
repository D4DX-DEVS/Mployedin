import mongoose, { Document, Schema } from "mongoose";

/**
 * OnboardingChecklist (FG-1)
 *
 * Post-hire onboarding workspace attached to a Placement. Holds a list of
 * onboarding tasks (with optional assignee/due date) and collected documents so
 * the employer can track a new hire from offer-accepted through to fully onboarded.
 */

export type OnboardingStatus = "not_started" | "in_progress" | "completed";

export interface IOnboardingTask {
  title: string;
  description?: string;
  assignee?: string;
  dueDate?: Date;
  completed: boolean;
  completedAt?: Date;
}

export interface IOnboardingDocument {
  name: string;
  url?: string;
  uploadedAt?: Date;
}

export interface IOnboardingChecklist extends Document {
  _id: mongoose.Types.ObjectId;
  placementId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  status: OnboardingStatus;
  startDate?: Date;
  tasks: IOnboardingTask[];
  documents: IOnboardingDocument[];
  notes?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OnboardingTaskSchema = new Schema<IOnboardingTask>(
  {
    title: { type: String, required: true },
    description: String,
    assignee: String,
    dueDate: Date,
    completed: { type: Boolean, default: false },
    completedAt: Date,
  },
  { _id: true }
);

const OnboardingDocumentSchema = new Schema<IOnboardingDocument>(
  {
    name: { type: String, required: true },
    url: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const OnboardingChecklistSchema = new Schema<IOnboardingChecklist>(
  {
    placementId: {
      type: Schema.Types.ObjectId,
      ref: "Placement",
      required: true,
      unique: true,
    },
    employerId: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
    },
    jobSeekerId: {
      type: Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
    },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed"],
      default: "not_started",
    },
    startDate: Date,
    tasks: { type: [OnboardingTaskSchema], default: [] },
    documents: { type: [OnboardingDocumentSchema], default: [] },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

OnboardingChecklistSchema.index({ employerId: 1, createdAt: -1 });

export const OnboardingChecklist =
  mongoose.models.OnboardingChecklist ||
  mongoose.model<IOnboardingChecklist>("OnboardingChecklist", OnboardingChecklistSchema);
export default OnboardingChecklist;
