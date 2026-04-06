import mongoose, { Document, Schema } from "mongoose";
import { encryptIfPlain, decrypt } from "@/lib/security/encryption";

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
  // Sensitive PII (encrypted at rest)
  nationalId?: string;
  visaNumber?: string;
  passportNumber?: string;
  bankAccountNumber?: string;
  iban?: string;
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
  preferredJobType: "remote" | "hybrid" | "onsite" | "any";
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
    nationalId: { type: String, select: false },
    visaNumber: { type: String, select: false },
    passportNumber: { type: String, select: false },
    bankAccountNumber: { type: String, select: false },
    iban: { type: String, select: false },
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
    preferredJobType: {
      type: String,
      enum: ["remote", "hybrid", "onsite", "any"],
      default: "any",
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

// Schema-level indexes removed — managed centrally in lib/db/indexes.ts

// Encrypt sensitive PII fields before saving
const JOBSEEKER_PII_FIELDS = ["nationalId", "visaNumber", "passportNumber", "bankAccountNumber", "iban"] as const;

JobSeekerSchema.pre("save", function () {
  for (const field of JOBSEEKER_PII_FIELDS) {
    const value = this[field];
    if (value && typeof value === "string") {
      this[field] = encryptIfPlain(value);
    }
  }
});

function decryptJobSeekerPII(doc: IJobSeeker | null) {
  if (!doc) return doc;
  for (const field of JOBSEEKER_PII_FIELDS) {
    const value = doc[field];
    if (value && typeof value === "string") {
      try { doc[field] = decrypt(value); } catch { /* already plain or corrupted */ }
    }
  }
  return doc;
}

JobSeekerSchema.post("findOne", function (doc) { decryptJobSeekerPII(doc); });
JobSeekerSchema.post("findOneAndUpdate", function (doc) { decryptJobSeekerPII(doc); });
JobSeekerSchema.post("save", function (doc) { decryptJobSeekerPII(doc); });

export const JobSeeker =
  mongoose.models.JobSeeker ||
  mongoose.model<IJobSeeker>("JobSeeker", JobSeekerSchema);
export default JobSeeker;
