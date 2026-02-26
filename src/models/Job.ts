import mongoose, { Document, Schema } from "mongoose";

export type JobStatus =
  | "draft"
  | "pending_approval"
  | "active"
  | "closed"
  | "expired";
export type WorkflowMode = "auto" | "manual";

export interface IJobRequirements {
  skills: string[];
  experienceMin: number;
  experienceMax: number;
  education?: string;
  languages: string[];
  nationality?: string[];
}

export interface IJobSalary {
  min: number;
  max: number;
  currency: string;
  isNegotiable?: boolean;
}

export interface IJobLocation {
  country: string;
  city: string;
  isRemote: boolean;
}

export interface IJobPoster {
  url?: string;
  approvalStatus: "pending" | "approved" | "rejected";
  uploadedAt?: Date;
}

export interface IJob extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  title: string;
  description: string;
  requirements: IJobRequirements;
  salary: IJobSalary;
  location: IJobLocation;
  status: JobStatus;
  workflowMode: WorkflowMode;
  vacancies: number;
  applicantIds: mongoose.Types.ObjectId[];
  poster: IJobPoster;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  expiresAt?: Date;
  views: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    requirements: {
      skills: [String],
      experienceMin: { type: Number, default: 0 },
      experienceMax: { type: Number, default: 30 },
      education: String,
      languages: [String],
      nationality: [String],
    },
    salary: {
      min: Number,
      max: Number,
      currency: { type: String, default: "AED" },
      isNegotiable: { type: Boolean, default: false },
    },
    location: {
      country: { type: String, required: true },
      city: { type: String, required: true },
      isRemote: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: ["draft", "pending_approval", "active", "closed", "expired"],
      default: "draft",
    },
    workflowMode: { type: String, enum: ["auto", "manual"], default: "manual" },
    vacancies: { type: Number, default: 1 },
    applicantIds: [{ type: Schema.Types.ObjectId, ref: "JobSeeker" }],
    poster: {
      url: String,
      approvalStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      uploadedAt: Date,
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    expiresAt: Date,
    views: { type: Number, default: 0 },
    tags: [String],
  },
  { timestamps: true }
);

JobSchema.index({ employerId: 1 });
JobSchema.index({ agentId: 1 });
JobSchema.index({ status: 1 });
JobSchema.index({ "location.country": 1 });
JobSchema.index({ "requirements.skills": 1 });
JobSchema.index({ createdAt: -1 });
JobSchema.index({ title: "text", description: "text", tags: "text" });

export const Job =
  mongoose.models.Job || mongoose.model<IJob>("Job", JobSchema);
export default Job;
