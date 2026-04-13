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
  genderId?: mongoose.Types.ObjectId;
  maritalStatusId?: mongoose.Types.ObjectId;
  currentLocation?: string;
  permanentAddress?: string;
  hometown?: string;
  pincode?: string;
  workPermitCountries: mongoose.Types.ObjectId[];
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
  // Documents
  documents: {
    id: string;
    name: string;
    category: "resume" | "college_certificate" | "course_certificate" | "professional_certificate" | "other";
    url: string;
    size: number;
    uploadedAt: Date;
  }[];
  // Onboarding
  headline?: string;
  workStatus?: "experienced" | "fresher";
  marketingConsent: boolean;
  totalExperienceYears: number;
  totalExperienceMonths: number;
  currentSalary?: { amount: number; currency: string };
  industry?: string;
  preferredLocations: string[];
  isOnboarded: boolean;
  // Preferences
  preferredCountries: string[];
  preferredRoles: string[];
  preferredSalary?: { min: number; max: number; currency: string };
  preferredJobType: "remote" | "hybrid" | "onsite" | "any";
  // Status
  availabilityStatus: "immediately" | "within_month" | "within_3_months" | "not_available";
  noticePeriod?: number; // in days
  applicationMode: "auto" | "manual";
  autoApplyCount: number;
  autoApplyResetAt?: Date;
  profileCompleteness: number; // 0-100
  // Badges
  badges: ("premium" | "skilled" | string)[];
  // Applications
  applicationIds: mongoose.Types.ObjectId[];
  // TalIndia
  enrolledCourses: string[];
  completedCourses: string[];
  skillsCoachProgress?: {
    lastTargetRole?: string;
    lastOverallScore?: number;
    previousOverallScore?: number;
    skillsAdded?: number;
    analysesCount?: number;
    lastAnalysisAt?: Date;
  };
  googleCalendar?: {
    connected: boolean;
    accessToken?: string;  // encrypted
    refreshToken?: string; // encrypted
    expiresAt?: Date;
    email?: string;
  };
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
    genderId: { type: Schema.Types.ObjectId, ref: "Gender" },
    maritalStatusId: { type: Schema.Types.ObjectId, ref: "MaritalStatus" },
    currentLocation: String,
    permanentAddress: String,
    hometown: String,
    pincode: String,
    workPermitCountries: [{ type: Schema.Types.ObjectId, ref: "Country" }],
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
    documents: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      category: { type: String, enum: ["resume", "college_certificate", "course_certificate", "professional_certificate", "other"], default: "other" },
      url: { type: String, required: true },
      size: { type: Number, default: 0 },
      uploadedAt: { type: Date, default: Date.now },
      _id: false,
    }],
    headline: String,
    workStatus: { type: String, enum: ["experienced", "fresher"] },
    marketingConsent: { type: Boolean, default: false },
    totalExperienceYears: { type: Number, default: 0, min: 0 },
    totalExperienceMonths: { type: Number, default: 0, min: 0, max: 11 },
    currentSalary: {
      amount: Number,
      currency: { type: String, default: "USD" },
    },
    industry: String,
    preferredLocations: [String],
    isOnboarded: { type: Boolean, default: false, index: true },
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
    autoApplyCount: { type: Number, default: 0, min: 0 },
    autoApplyResetAt: Date,
    profileCompleteness: { type: Number, default: 0, min: 0, max: 100 },
    badges: [String],
    applicationIds: [{ type: Schema.Types.ObjectId, ref: "Application" }],
    enrolledCourses: [String],
    completedCourses: [String],
    skillsCoachProgress: {
      lastTargetRole: String,
      lastOverallScore: { type: Number, min: 0, max: 100 },
      previousOverallScore: { type: Number, min: 0, max: 100 },
      skillsAdded: { type: Number, default: 0, min: 0 },
      analysesCount: { type: Number, default: 0, min: 0 },
      lastAnalysisAt: Date,
    },
    googleCalendar: {
      connected: { type: Boolean, default: false },
      accessToken: { type: String, select: false },
      refreshToken: { type: String, select: false },
      expiresAt: Date,
      email: String,
    },
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
