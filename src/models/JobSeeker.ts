import mongoose, { Document, Schema } from "mongoose";

export interface IWorkExperience {
  jobTitle: string;
  company: string;
  startDate?: Date;
  endDate?: Date;
  isCurrent: boolean;
  description?: string;
  country?: string;
}

export interface IEducation {
  degree: string;
  institution: string;
  field?: string;
  graduationDate?: Date;
  grade?: string;
}

export interface ILanguageSkill {
  language: string;
  proficiency: "basic" | "conversational" | "professional" | "native";
}

export interface IJobSeeker extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  premiumLinkTag?: string;
  // Profile
  nationality?: string;
  dateOfBirth?: Date;
  gender?: string;
  currentLocation?: string;
  // CV
  cv: {
    originalUrl?: string;
    parsedAt?: Date;
    rawText?: string;
  };
  // Skills & Experience
  skills: string[];
  suggestedSkills: string[];
  experience: IWorkExperience[];
  education: IEducation[];
  languages: ILanguageSkill[];
  certifications: string[];
  // Preferences
  preferredCountries: string[];
  preferredRoles: string[];
  preferredSalary?: { min: number; max: number; currency: string };
  // Status
  availabilityStatus: "immediately" | "within_month" | "within_3_months" | "not_available";
  noticePeriod?: number; // in days
  applicationMode: "auto" | "manual";
  profileCompleteness: number; // 0-100
  // Badges
  badges: ("premium" | "skilled" | string)[];
  // Applications
  applicationIds: mongoose.Types.ObjectId[];
  // TalIndia
  enrolledCourses: string[];
  completedCourses: string[];
  createdAt: Date;
  updatedAt: Date;
}

const WorkExperienceSchema = new Schema<IWorkExperience>({
  jobTitle: { type: String, required: true },
  company: { type: String, required: true },
  startDate: Date,
  endDate: Date,
  isCurrent: { type: Boolean, default: false },
  description: String,
  country: String,
});

const EducationSchema = new Schema<IEducation>({
  degree: { type: String, required: true },
  institution: { type: String, required: true },
  field: String,
  graduationDate: Date,
  grade: String,
});

const LanguageSchema = new Schema<ILanguageSkill>({
  language: { type: String, required: true },
  proficiency: {
    type: String,
    enum: ["basic", "conversational", "professional", "native"],
    default: "conversational",
  },
});

const JobSeekerSchema = new Schema<IJobSeeker>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    premiumLinkTag: String,
    nationality: String,
    dateOfBirth: Date,
    gender: String,
    currentLocation: String,
    cv: {
      originalUrl: String,
      parsedAt: Date,
      rawText: String,
    },
    skills: [String],
    suggestedSkills: [String],
    experience: [WorkExperienceSchema],
    education: [EducationSchema],
    languages: [LanguageSchema],
    certifications: [String],
    preferredCountries: [String],
    preferredRoles: [String],
    preferredSalary: {
      min: Number,
      max: Number,
      currency: { type: String, default: "USD" },
    },
    availabilityStatus: {
      type: String,
      enum: ["immediately", "within_month", "within_3_months", "not_available"],
      default: "immediately",
    },
    noticePeriod: Number,
    applicationMode: { type: String, enum: ["auto", "manual"], default: "manual" },
    profileCompleteness: { type: Number, default: 0, min: 0, max: 100 },
    badges: [String],
    applicationIds: [{ type: Schema.Types.ObjectId, ref: "Application" }],
    enrolledCourses: [String],
    completedCourses: [String],
  },
  { timestamps: true }
);

JobSeekerSchema.index({ userId: 1 }, { unique: true });
JobSeekerSchema.index({ agentId: 1 });
JobSeekerSchema.index({ skills: 1 });
JobSeekerSchema.index({ availabilityStatus: 1 });
JobSeekerSchema.index({ badges: 1 });

export const JobSeeker =
  mongoose.models.JobSeeker ||
  mongoose.model<IJobSeeker>("JobSeeker", JobSeekerSchema);
export default JobSeeker;
