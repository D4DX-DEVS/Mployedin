import mongoose, { Document, Schema } from "mongoose";

export type JobStatus =
  | "draft"
  | "active"
  | "paused"
  | "closed"
  | "expired";
export type WorkflowMode = "auto" | "manual";

export interface IJobRequirements {
  skills: string[];
  preferredSkills?: string[];
  /**
   * Skills read out of the description by `extractJobSkills`, used only when
   * the employer typed none. Kept apart from `skills` so a human's stated
   * requirement always outranks a model's guess, and so an extraction can be
   * redone or discarded without touching employer data.
   */
  aiSkills?: string[];
  aiPreferredSkills?: string[];
  /** When the extraction last ran, so a backfill can skip what it has done. */
  aiSkillsAt?: Date;
  experienceMin: number;
  experienceMax: number;
  education?: string;
  languages: string[];
  nationality?: string[];
}

export type SalaryPeriod = "monthly" | "yearly" | "lpa";
export type JobVisibility = "public" | "private" | "invite_only";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "freelance" | "walk_in";
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
  /**
   * Where a remote job may actually be worked from.
   *
   * `isRemote` on its own says nothing about eligibility: a remote job can
   * still be limited by work authorisation, payroll entity or timezone, and
   * the matcher used to read `isRemote` as "anyone, anywhere" and skip the
   * country check entirely.
   *
   * Unset is not "worldwide" — it means the employer has never been asked.
   * Jobs posted before this field existed keep whatever `country` says, which
   * is the only thing about them we actually know.
   */
  remoteScope?: "worldwide" | "countries";
  /** Countries a `remoteScope: "countries"` job will hire from. */
  remoteCountries?: string[];
}

export interface IJobPoster {
  url?: string;
  uploadedAt?: Date;
}

export interface IWorkflowStage {
  id: string;
  label: string;
  /** The application status this stage runs under. Set on every snapshot taken from a template. */
  phase?: string;
  enabled?: boolean;
  autoProgress?: boolean;
  order: number;
}

/** Where a job's stage list came from (lib/hiring/jobWorkflow.ts). */
export type JobWorkflowSource = "auto" | "manual" | "custom";

export interface IJobWorkflowTemplateRef {
  /** Null when the job runs the standard pipeline (no template matched and no default exists). */
  templateId?: mongoose.Types.ObjectId | null;
  name?: string;
  version?: number;
  /** auto = picked from the job's details; manual = chosen by a person; custom = stages edited for this job. */
  source: JobWorkflowSource;
  /** Why an automatic pick happened ("matched:category,title", "employer_default", …). */
  reason?: string;
  appliedAt: Date;
}

export interface IWorkflowSettings {
  /** Retired 2026-09-10 — scoring always runs. Kept so old documents still type. */
  aiAutoScreen?: boolean;
  notifyOnStageChange?: boolean;
  /** Only applied when autoRejectEnabled is true. */
  autoRejectBelow?: number;
  /** Opt-in: reject on arrival below the threshold. Absent on legacy docs = off. */
  autoRejectEnabled?: boolean;
  /** Default N for "shortlist the best N". */
  shortlistTarget?: number;
}

export interface IJobWorkflow {
  /** A snapshot of the template's stages, taken when the job was given it. Read only when `template` is set. */
  stages?: IWorkflowStage[];
  settings?: IWorkflowSettings;
  /** Set by PATCH /api/jobs/[id]/workflow. Absent = the job follows the employer rules. */
  customizedAt?: Date;
  /** Absent on jobs posted before workflow templates took effect — they run the standard pipeline. */
  template?: IJobWorkflowTemplateRef;
}

export interface IMatchingWeights {
  skills: number;
  experience: number;
  education: number;
  industryExperience: number;
  preferredQualifications: number;
}

export type ScreeningQuestionType = "text" | "textarea" | "select" | "checkbox" | "radio" | "number" | "date";

export interface IScreeningQuestion {
  id: string;
  label: string;
  type: ScreeningQuestionType;
  required: boolean;
  options?: string[];
  placeholder?: string;
  order: number;
}

/** A deal-breaker rule on one screening question — employer-only (see lib/matching/knockouts.ts). */
export interface IScreeningKnockout {
  questionId: string;
  acceptedAnswers?: string[];
  minValue?: number;
  /** A preferred answer: adds to the score, never excludes (lib/matching/knockouts.ts). */
  preferred?: boolean;
}

export interface IJob extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  requirements: IJobRequirements;
  salary: IJobSalary;
  location: IJobLocation;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  duration?: string;
  responsibilities?: string[];
  responsibilitiesAr?: string[];
  qualifications?: string[];
  qualificationsAr?: string[];
  benefits?: string[];
  benefitsAr?: string[];
  learningOutcomes?: string[];
  status: JobStatus;
  workflowMode: WorkflowMode;
  workflow?: IJobWorkflow;
  matchingWeights?: IMatchingWeights;
  screeningQuestions?: IScreeningQuestion[];
  /** Private: which answers qualify. Never served with the public questions. */
  screeningKnockouts?: IScreeningKnockout[];
  vacancies?: number;
  applicantIds: mongoose.Types.ObjectId[];
  poster: IJobPoster;
  /** Set when the job was paused because its employer account was deactivated. */
  pauseReason?: "employer_deactivated";
  expiresAt?: Date;
  maxApplicants?: number;
  showSalary?: boolean;
  views: number;
  uniqueViews: number;
  tags: string[];
  visibility: JobVisibility;
  category?: string;
  isFeatured?: boolean;
  featuredUntil?: Date;
  isWalkIn?: boolean;
  walkInDetails?: {
    date?: Date;
    time?: string;
    venue?: string;
    contactPerson?: string;
    contactPhone?: string;
  };
  locations?: IJobLocation[];
  clonedFrom?: mongoose.Types.ObjectId;
  deletedAt?: Date;
  preDeletionStatus?: JobStatus;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    title: { type: String, required: true, trim: true },
    titleAr: { type: String, trim: true },
    description: { type: String, required: true },
    descriptionAr: { type: String },
    requirements: {
      skills: [String],
      preferredSkills: [String],
      aiSkills: [String],
      aiPreferredSkills: [String],
      aiSkillsAt: Date,
      experienceMin: { type: Number, default: 0 },
      experienceMax: { type: Number, default: 30 },
      education: String,
      languages: [String],
      nationality: [String],
    },
    employmentType: {
      type: String,
      enum: ["full_time", "part_time", "contract", "internship", "freelance", "walk_in"],
    },
    workMode: {
      type: String,
      enum: ["onsite", "hybrid", "remote"],
    },
    duration: String,
    responsibilities: [String],
    responsibilitiesAr: [String],
    qualifications: [String],
    qualificationsAr: [String],
    benefits: [String],
    benefitsAr: [String],
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
      // No default: absent has to stay distinguishable from a chosen value,
      // the same rule availabilityStatusSetAt follows on JobSeeker. A default
      // of "worldwide" here would silently re-create the bug this replaces.
      remoteScope: { type: String, enum: ["worldwide", "countries"] },
      remoteCountries: { type: [String], default: undefined },
    },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "closed", "expired"],
      default: "draft",
    },
    workflowMode: { type: String, enum: ["auto", "manual"], default: "manual" },
    workflow: {
      stages: [{
        id: String,
        label: String,
        phase: String,
        enabled: { type: Boolean, default: true },
        autoProgress: { type: Boolean, default: false },
        order: Number,
      }],
      // No defaults on purpose. Mongoose persisted them on every job, so a
      // "job overrides employer" resolver could not tell a saved override from
      // a default that would silently beat the employer's rule. Overrides count
      // only once customizedAt is stamped by PATCH /api/jobs/[id]/workflow
      // (src/lib/hiring/workflowSettings.ts). A missing autoRejectEnabled = OFF.
      settings: {
        aiAutoScreen: Boolean,
        notifyOnStageChange: Boolean,
        autoRejectBelow: Number,
        autoRejectEnabled: Boolean,
        shortlistTarget: { type: Number, min: 5, max: 100 },
      },
      customizedAt: Date,
      // Which workflow the stage snapshot above came from. Set on every job
      // posted since workflow templates took effect (the pre-save hook below).
      template: {
        templateId: { type: Schema.Types.ObjectId, ref: "WorkflowTemplate" },
        name: String,
        version: Number,
        source: { type: String, enum: ["auto", "manual", "custom"] },
        reason: String,
        appliedAt: Date,
      },
    },
    matchingWeights: {
      skills: Number,
      experience: Number,
      education: Number,
      industryExperience: Number,
      preferredQualifications: Number,
    },
    screeningQuestions: [{
      id: { type: String, required: true },
      label: { type: String, required: true, maxlength: 500 },
      type: { type: String, enum: ["text", "textarea", "select", "checkbox", "radio", "number", "date"], required: true },
      required: { type: Boolean, default: false },
      options: [{ type: String, maxlength: 200 }],
      placeholder: { type: String, maxlength: 200 },
      order: { type: Number, default: 0 },
      _id: false,
    }],
    screeningKnockouts: [{
      questionId: { type: String, required: true },
      acceptedAnswers: [{ type: String, maxlength: 200 }],
      minValue: Number,
      preferred: Boolean,
      _id: false,
    }],
    vacancies: { type: Number, min: 1 },
    applicantIds: [{ type: Schema.Types.ObjectId, ref: "JobSeeker" }],
    poster: {
      url: String,
      uploadedAt: Date,
    },
    // Set when the job was paused because its employer account was deactivated;
    // reactivation resumes exactly these jobs (see lib/employers/accountStatus).
    pauseReason: { type: String, enum: ["employer_deactivated"] },
    expiresAt: Date,
    maxApplicants: { type: Number, min: 1 },
    showSalary: { type: Boolean, default: true },
    views: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    tags: [String],
    visibility: { type: String, enum: ["public", "private", "invite_only"], default: "public" },
    category: String,
    isFeatured: { type: Boolean, default: false },
    featuredUntil: { type: Date },
    isWalkIn: { type: Boolean, default: false },
    walkInDetails: {
      date: Date,
      time: String,
      venue: String,
      contactPerson: String,
      contactPhone: String,
    },
    locations: [{
      country: { type: String },
      city: { type: String },
      isRemote: { type: Boolean, default: false },
      _id: false,
    }],
    clonedFrom: { type: Schema.Types.ObjectId, ref: "Job" },
    deletedAt: { type: Date, default: null },
    // Status at soft-delete time, so restore can put the job back as it was
    preDeletionStatus: {
      type: String,
      enum: ["draft", "active", "paused", "closed", "expired"],
    },
  },
  { timestamps: true }
);

JobSchema.index({ employerId: 1 });
JobSchema.index({ agentId: 1 });
JobSchema.index({ status: 1 });
JobSchema.index({ deletedAt: 1 });
JobSchema.index({ "location.country": 1 });
JobSchema.index({ "requirements.skills": 1 });
JobSchema.index({ createdAt: -1 });
JobSchema.index({ isFeatured: -1, createdAt: -1 });
// Must match lib/db/indexes.ts `jobs_text_search` — Mongo allows only one text
// index per collection, so a mismatch here silently blocks the weighted one.
JobSchema.index(
  { title: "text", description: "text", "requirements.skills": "text" },
  { name: "jobs_text_search", weights: { title: 10, "requirements.skills": 5, description: 1 } }
);

JobSchema.index({ "workflow.template.templateId": 1 });

// Remember the status a job was loaded with, so the workflow hook below can
// tell a draft being published from a live job being paused or closed.
JobSchema.post("init", function (doc) {
  doc.$locals.initialStatus = doc.status;
});

// Every job runs a hiring workflow: the template its poster picked, or the one
// its details match (lib/hiring/jobWorkflow.ts). Imported lazily — the helper
// reads other models. It never throws, so a lookup failure cannot block a save.
JobSchema.pre("save", async function () {
  const { applyJobWorkflowOnSave } = await import("@/lib/hiring/jobWorkflow");
  await applyJobWorkflowOnSave(this as unknown as import("@/lib/hiring/jobWorkflow").WorkflowHookJob);
});

export const Job =
  mongoose.models.Job || mongoose.model<IJob>("Job", JobSchema);
export default Job;
