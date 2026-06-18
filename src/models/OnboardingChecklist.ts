import mongoose, { Document, Schema } from "mongoose";

/**
 * OnboardingChecklist (FG-1)
 *
 * Post-hire onboarding workspace attached to a Placement. Holds a list of
 * onboarding tasks (with optional assignee/due date) and collected documents so
 * the employer can track a new hire from offer-accepted through to fully onboarded.
 */

export type OnboardingStatus = "not_started" | "in_progress" | "completed";

/** Lifecycle of a single onboarding document. */
export type OnboardingDocStatus = "requested" | "submitted" | "signed" | "approved";

/** Probation period outcome for a new hire. */
export type ProbationStatus = "pending" | "passed" | "failed" | "extended";

export interface IOnboardingTask {
  title: string;
  description?: string;
  /** Denormalised display name of the assignee (team member or free text). */
  assignee?: string;
  /** Optional reference to the assigned team member's user account. */
  assigneeUserId?: mongoose.Types.ObjectId;
  dueDate?: Date;
  completed: boolean;
  completedAt?: Date;
}

/** Typed-name e-signature captured when a candidate signs a document. */
export interface IDocumentSignature {
  fullName: string;
  signedAt: Date;
  ip?: string;
}

export interface IOnboardingDocument {
  name: string;
  url?: string;
  uploadedAt?: Date;
  /** True when the employer is requesting the candidate to provide this document. */
  requestedFromCandidate?: boolean;
  /** True when the candidate must e-sign (typed name) this document. */
  requiresSignature?: boolean;
  /** Lifecycle status for requested/candidate-supplied documents. */
  status?: OnboardingDocStatus;
  /** Who last supplied the file. */
  uploadedBy?: "employer" | "candidate";
  /** Optional due date for a requested document. */
  dueDate?: Date;
  /** Candidate's typed-name signature, when signed. */
  signature?: IDocumentSignature;
}

export interface IProbation {
  endDate?: Date;
  status?: ProbationStatus;
  notes?: string;
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
  probation?: IProbation;
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
    assigneeUserId: { type: Schema.Types.ObjectId, ref: "User" },
    dueDate: Date,
    completed: { type: Boolean, default: false },
    completedAt: Date,
  },
  { _id: true }
);

const DocumentSignatureSchema = new Schema<IDocumentSignature>(
  {
    fullName: { type: String, required: true },
    signedAt: { type: Date, required: true },
    ip: String,
  },
  { _id: false }
);

const OnboardingDocumentSchema = new Schema<IOnboardingDocument>(
  {
    name: { type: String, required: true },
    url: String,
    uploadedAt: { type: Date, default: Date.now },
    requestedFromCandidate: { type: Boolean, default: false },
    requiresSignature: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["requested", "submitted", "signed", "approved"],
    },
    uploadedBy: { type: String, enum: ["employer", "candidate"] },
    dueDate: Date,
    signature: { type: DocumentSignatureSchema, default: undefined },
  },
  { _id: true }
);

const ProbationSchema = new Schema<IProbation>(
  {
    endDate: Date,
    status: {
      type: String,
      enum: ["pending", "passed", "failed", "extended"],
    },
    notes: String,
  },
  { _id: false }
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
    probation: { type: ProbationSchema, default: undefined },
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
