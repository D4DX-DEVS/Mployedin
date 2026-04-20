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
  preferredSkills?: string[];
  experienceMin: number;
  experienceMax: number;
  education?: string;
  languages: string[];
  nationality?: string[];
}

export type SalaryPeriod = "monthly" | "yearly" | "lpa";
export type JobVisibility = "public" | "private" | "invite_only";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "freelance";
export type WorkMode = "onsite" | "hybrid" | "remote";

export interface IJobSalary {
  min: number;
  max: number;
  currency: string;
  isNegotiable?: boolean;
  period?: SalaryPeriod;
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

export interface IWorkflowStage {
  id: string;
  label: string;
  enabled: boolean;
  autoProgress: boolean;
  order: number;
}

export interface IWorkflowSettings {
  aiAutoScreen: boolean;
  notifyOnStageChange: boolean;
  autoRejectBelow: number;
}

export interface IJobWorkflow {
  stages?: IWorkflowStage[];
  settings?: IWorkflowSettings;
}

export interface IMatchingWeights {
  skills: number;
  experience: number;
  education: number;
  location: number;
  salary: number;
  languages: number;
  availability: number;
  behaviorSignals: number;
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
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  duration?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  learningOutcomes?: string[];
  status: JobStatus;
  workflowMode: WorkflowMode;
  workflow?: IJobWorkflow;
  matchingWeights?: IMatchingWeights;
  vacancies?: number;
  applicantIds: mongoose.Types.ObjectId[];
  poster: IJobPoster;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  expiresAt?: Date;
  maxApplicants?: number;
  showSalary?: boolean;
  views: number;
  uniqueViews: number;
  tags: string[];
  visibility: JobVisibility;
  category?: string;
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
      preferredSkills: [String],
      experienceMin: { type: Number, default: 0 },
      experienceMax: { type: Number, default: 30 },
      education: String,
      languages: [String],
      nationality: [String],
    },
    employmentType: {
      type: String,
      enum: ["full_time", "part_time", "contract", "internship", "freelance"],
    },
    workMode: {
      type: String,
      enum: ["onsite", "hybrid", "remote"],
    },
    duration: String,
    responsibilities: [String],
    qualifications: [String],
    benefits: [String],
    learningOutcomes: [String],
    salary: {
      min: Number,
      max: Number,
      currency: { type: String, default: "AED" },
      isNegotiable: { type: Boolean, default: false },
      period: { type: String, enum: ["monthly", "yearly", "lpa"], default: "monthly" },
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
    workflow: {
      stages: [{
        id: String,
        label: String,
        enabled: { type: Boolean, default: true },
        autoProgress: { type: Boolean, default: false },
        order: Number,
      }],
      settings: {
        aiAutoScreen: { type: Boolean, default: true },
        notifyOnStageChange: { type: Boolean, default: true },
        autoRejectBelow: { type: Number, default: 40 },
      },
    },
    matchingWeights: {
      skills: Number,
      experience: Number,
      education: Number,
      location: Number,
      salary: Number,
      languages: Number,
      availability: Number,
      behaviorSignals: Number,
    },
    vacancies: { type: Number, min: 1 },
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
    maxApplicants: { type: Number, min: 1 },
    showSalary: { type: Boolean, default: true },
    views: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    tags: [String],
    visibility: { type: String, enum: ["public", "private", "invite_only"], default: "public" },
    category: String,
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
JobSchema.index(
  { status: 1, "poster.approvalStatus": 1, createdAt: -1 },
  { partialFilterExpression: { status: "active" } }
);

export const Job =
  mongoose.models.Job || mongoose.model<IJob>("Job", JobSchema);
export default Job;
