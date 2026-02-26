import mongoose, { Document, Schema } from "mongoose";

export type ApplicationStatus =
  | "applied"
  | "shortlisted"
  | "interview_scheduled"
  | "selected"
  | "rejected"
  | "withdrawn";

export interface IAIMatchBreakdown {
  skills: number;
  experience: number;
  education: number;
  availability: number;
  overall: number;
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
  matchBreakdown?: IAIMatchBreakdown;
  matchNotes?: string;
  interviewIds: mongoose.Types.ObjectId[];
  rejectionReason?: string;
  employerNotes?: string;
  agentNotes?: string;
  appliedAt: Date;
  statusHistory: {
    status: ApplicationStatus;
    changedAt: Date;
    changedBy?: mongoose.Types.ObjectId;
    note?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

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
        "rejected",
        "withdrawn",
      ],
      default: "applied",
    },
    documents: [
      {
        name: String,
        url: String,
        type: String,
        _id: false,
      },
    ],
    aiMatchScore: Number,
    matchBreakdown: {
      skills: Number,
      experience: Number,
      education: Number,
      availability: Number,
      overall: Number,
    },
    matchNotes: String,
    interviewIds: [{ type: Schema.Types.ObjectId, ref: "Interview" }],
    rejectionReason: String,
    employerNotes: String,
    agentNotes: String,
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
