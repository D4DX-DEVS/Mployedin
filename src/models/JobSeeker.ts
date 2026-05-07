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
  canRead?: boolean;
  canWrite?: boolean;
  canSpeak?: boolean;
}

export interface IProject {
  title: string;
  description?: string;
  techStack: string[];
  projectUrl?: string;
  repoUrl?: string;
  startDate?: Date;
  endDate?: Date;
  isCurrent?: boolean;
}

export interface ISocialLink {
  label: string;
  url: string;
}

export interface IAccomplishment {
  type: "online_profile" | "work_sample" | "publication" | "presentation" | "patent" | "certification";
  title: string;
  url?: string;
  description?: string;
  date?: Date;
}

export interface ICareerProfile {
  currentIndustry?: string;
  department?: string;
  roleCategory?: string;
  jobRole?: string;
  desiredJobType?: string[];       // contractual, permanent, freelance
  desiredEmploymentType?: string[]; // full_time, part_time, internship
  preferredShift?: string;          // day, night, flexible, rotational
}

export interface IDiversityInclusion {
  hasDisability?: boolean;
  disabilityDetails?: string;
  veteranStatus?: boolean;
  careerBreak?: { hasBreak: boolean; reason?: string; startDate?: Date; endDate?: Date };
}

export interface IJobSeeker extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  premiumLinkTag?: string;
  // Profile
  fullName?: string;
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
  // Projects & Accomplishments
  projects: IProject[];
  accomplishments: IAccomplishment[];
  // Social / Portfolio Links
  socialLinks: ISocialLink[];
  // Career Profile
  careerProfile?: ICareerProfile;
  // Diversity & Inclusion
  diversityInclusion?: IDiversityInclusion;
  // Profile Visibility
  profileVisibility: "visible" | "hidden"; // employers can/can't find you
  sectionVisibility?: Record<string, boolean>; // per-section visibility toggles
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
  summary?: string;
  headline?: string;
  workStatus?: "experienced" | "fresher";
  marketingConsent: boolean;
  totalExperienceYears: number;
  totalExperienceMonths: number;
  currentSalary?: { amount: number; currency: string };
  industry?: string;
  preferredLocations: string[];
  isOnboarded: boolean;
  profileCompletedLater?: boolean;
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
  // Profile Boost
  isProfileBoosted?: boolean;
  profileBoostedUntil?: Date;
  profileBoostCount?: number;
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
  availableHours?: {
    day: string; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
    startTime: string; // HH:mm (24h)
    endTime: string;   // HH:mm (24h)
  }[];
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
  canRead: { type: Boolean, default: true },
  canWrite: { type: Boolean, default: true },
  canSpeak: { type: Boolean, default: true },
});

const ProjectSchema = new Schema<IProject>({
  title: { type: String, required: true },
  description: String,
  techStack: [String],
  projectUrl: String,
  repoUrl: String,
  startDate: Date,
  endDate: Date,
  isCurrent: { type: Boolean, default: false },
});

const AccomplishmentSchema = new Schema<IAccomplishment>({
  type: {
    type: String,
    enum: ["online_profile", "work_sample", "publication", "presentation", "patent", "certification"],
    required: true,
  },
  title: { type: String, required: true },
  url: String,
  description: String,
  date: Date,
});

const CareerProfileSchema = new Schema<ICareerProfile>({
  currentIndustry: String,
  department: String,
  roleCategory: String,
  jobRole: String,
  desiredJobType: [String],
  desiredEmploymentType: [String],
  preferredShift: String,
}, { _id: false });

const DiversityInclusionSchema = new Schema<IDiversityInclusion>({
  hasDisability: Boolean,
  disabilityDetails: String,
  veteranStatus: Boolean,
  careerBreak: {
    hasBreak: { type: Boolean, default: false },
    reason: String,
    startDate: Date,
    endDate: Date,
  },
}, { _id: false });

const JobSeekerSchema = new Schema<IJobSeeker>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    premiumLinkTag: String,
    fullName: String,
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
    projects: [ProjectSchema],
    accomplishments: [AccomplishmentSchema],
    socialLinks: [{
      label: { type: String, required: true },
      url: { type: String, required: true },
      _id: false,
    }],
    careerProfile: CareerProfileSchema,
    diversityInclusion: DiversityInclusionSchema,
    profileVisibility: { type: String, enum: ["visible", "hidden"], default: "visible" },
    sectionVisibility: {
      type: Map,
      of: Boolean,
      default: {},
    },
    documents: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      category: { type: String, enum: ["resume", "college_certificate", "course_certificate", "professional_certificate", "other"], default: "other" },
      url: { type: String, required: true },
      size: { type: Number, default: 0 },
      uploadedAt: { type: Date, default: Date.now },
      _id: false,
    }],
    summary: String,
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
    profileCompletedLater: { type: Boolean, default: false },
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
    isProfileBoosted: { type: Boolean, default: false },
    profileBoostedUntil: { type: Date },
    profileBoostCount: { type: Number, default: 0, min: 0 },
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
    availableHours: [
      {
        day: { type: String, enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], required: true },
        startTime: { type: String, required: true }, // HH:mm
        endTime: { type: String, required: true },   // HH:mm
        _id: false,
      },
    ],
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
