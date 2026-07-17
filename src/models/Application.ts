import mongoose, { Document, Schema } from "mongoose";

export type ApplicationStatus =
  | "applied"
  | "shortlisted"
  | "interview_scheduled"
  | "selected"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn";

export interface INote {
  _id: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  authorName: string;
  content: string;
  mentions: mongoose.Types.ObjectId[];
  createdAt: Date;
}

export interface IAIMatchBreakdown {
  skills: number;
  experience: number;
  education: number;
  availability: number;
  overall: number;
}

export interface IBehaviorSignals {
  responseTime?: number;
  coverLetterCustomized?: boolean;
  profileCompleteness: number;
  applicationCompleteness: number;
  companyProfileViewed?: boolean;
  lastActiveAt?: Date;
}

export interface IScreeningAnswer {
  questionId: string;
  questionLabel: string;
  answer: string | string[] | boolean;
}

export interface IApplication extends Document {
  _id: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  status: ApplicationStatus;
  documents: { name: string; url: string; type: string }[];
  aiMatchScore?: number;
  /** Set once the employer notifies this candidate via the AI-match "Notify" action. */
  aiMatchNotifiedAt?: Date;
  /** Set the first time the employer opens this application — drives the "New" badge. */
  viewedByEmployerAt?: Date;
  matchBreakdown?: IAIMatchBreakdown;
  matchNotes?: string;
  matchStrengths?: string[];
  matchGaps?: string[];
  behaviorSignals?: IBehaviorSignals;
  behaviorScore?: number;
  interviewIds: mongoose.Types.ObjectId[];
  rejectionReason?: string;
  employerNotes?: string;
  agentNotes?: string;
  withdrawalReason?: string;
  withdrawalNote?: string;
  source?: 'easy_apply' | 'full_form' | 'direct' | 'auto_apply';
  autoApplied: boolean;
  screeningAnswers?: IScreeningAnswer[];
  notes: INote[];
  appliedAt: Date;
  statusHistory: {
    status: ApplicationStatus;
    changedAt: Date;
    changedBy?: mongoose.Types.ObjectId;
    note?: string;
  }[];
  slaAlertSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Explicit sub-schema so the field literally named `type` is treated as a path
// rather than a SchemaType declaration (a known Mongoose inline-definition pitfall).
const ApplicationDocumentSchema = new Schema(
  {
    name: String,
    url: String,
    type: String,
  },
  { _id: false }
);

const ApplicationSchema = new Schema<IApplication>(
  {
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "JobSeeker", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    status: {
      type: String,
      enum: [
        "applied",
        "shortlisted",
        "interview_scheduled",
        "selected",
        "offer",
        "hired",
        "rejected",
        "withdrawn",
      ],
      default: "applied",
    },
    documents: [ApplicationDocumentSchema],
    aiMatchScore: Number,
    aiMatchNotifiedAt: Date,
    viewedByEmployerAt: Date,
    matchBreakdown: {
      skills: Number,
      experience: Number,
      education: Number,
      availability: Number,
      overall: Number,
    },
    matchNotes: String,
    matchStrengths: [{ type: String }],
    matchGaps: [{ type: String }],
    behaviorSignals: {
      responseTime: Number,
      coverLetterCustomized: Boolean,
      profileCompleteness: { type: Number, default: 0 },
      applicationCompleteness: { type: Number, default: 0 },
      companyProfileViewed: { type: Boolean, default: false },
      lastActiveAt: Date,
      _id: false,
    },
    behaviorScore: Number,
    interviewIds: [{ type: Schema.Types.ObjectId, ref: "Interview" }],
    rejectionReason: String,
    employerNotes: String,
    agentNotes: String,
    withdrawalReason: {
      type: String,
      enum: [
        "accepted_elsewhere",
        "salary_too_low",
        "bad_experience",
        "too_slow_process",
        "changed_mind",
        "personal_reasons",
        "other",
      ],
    },
    withdrawalNote: { type: String, maxlength: 500 },
    source: {
      type: String,
      enum: ['easy_apply', 'full_form', 'direct', 'auto_apply'],
      default: 'full_form',
    },
    autoApplied: { type: Boolean, default: false },
    screeningAnswers: [{
      questionId: { type: String, required: true },
      questionLabel: { type: String, required: true },
      answer: { type: Schema.Types.Mixed, required: true },
      _id: false,
    }],
    notes: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        authorName: { type: String, required: true },
        content: { type: String, required: true, maxlength: 2000 },
        mentions: [{ type: Schema.Types.ObjectId, ref: "User" }],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    appliedAt: { type: Date, default: Date.now },
    statusHistory: [
      {
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: Schema.Types.ObjectId,
        note: String,
        _id: false,
      },
    ],
    slaAlertSentAt: Date,
  },
  { timestamps: true }
);

ApplicationSchema.index({ jobSeekerId: 1 });
ApplicationSchema.index({ jobId: 1 });
ApplicationSchema.index({ employerId: 1 });
ApplicationSchema.index({ agentId: 1 });
ApplicationSchema.index({ status: 1 });
ApplicationSchema.index({ aiMatchScore: -1 });
ApplicationSchema.index({ appliedAt: -1 });

export const Application =
  mongoose.models.Application ||
  mongoose.model<IApplication>("Application", ApplicationSchema);
export default Application;
