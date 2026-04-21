import mongoose, { Document, Schema } from "mongoose";
import { encryptIfPlain, decrypt } from "@/lib/security/encryption";

export type VerificationLevel = "basic" | "company" | "premium";
export type WorkflowMode = "auto" | "manual";

export interface IEmployerSocialLinks {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
}

export interface IHiringPreferences {
  defaultVisibility?: "public" | "private";
  preferredLocations?: string[];
  workType?: "remote" | "onsite" | "hybrid" | "flexible";
}

export interface INotificationPrefs {
  emailNewApplicant?: boolean;
  emailInterviewScheduled?: boolean;
  emailOfferResponse?: boolean;
  emailWeeklyDigest?: boolean;
  inAppAll?: boolean;
}

export interface IEmployer extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  // Company Info
  companyName: string;
  companyEmail: string;
  phone: string;
  designation?: string;
  registrationNo?: string;
  taxId?: string;
  address?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  // Profile
  logo?: string;
  coverImage?: string;
  description?: string;
  foundedYear?: number;
  socialLinks?: IEmployerSocialLinks;
  // Preferences
  hiringPreferences?: IHiringPreferences;
  notificationPrefs?: INotificationPrefs;
  // Verification
  verificationLevel: VerificationLevel;
  verificationDocs: string[];
  verifiedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  domainVerified: boolean;
  domainVerifiedAt?: Date;
  domainVerificationToken?: string;
  domainVerificationSentAt?: Date;
  // Agent-verified badge
  isAgentVerified: boolean;
  verifiedByAgentId?: mongoose.Types.ObjectId;
  // Settings
  workflowMode: WorkflowMode;
  workflow?: Record<string, unknown>;
  matchingWeights?: Record<string, number>;
  responseTimeCommitment?: number;
  // SMTP override (premium feature)
  smtpOverride?: {
    smtpEmail?: string;
    smtpAppPassword?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
  };
  // Related
  jobIds: mongoose.Types.ObjectId[];
  // Payment
  paymentStatus: "active" | "pending" | "overdue";
  subscriptionType?: "basic" | "premium";
  createdAt: Date;
  updatedAt: Date;
}

const EmployerSchema = new Schema<IEmployer>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    companyName: { type: String, required: true, trim: true },
    companyEmail: { type: String, required: true, lowercase: true },
    phone: { type: String, required: true },
    designation: String,
    registrationNo: String,
    taxId: String,
    address: String,
    website: String,
    industry: String,
    companySize: String,
    // Profile
    logo: String,
    coverImage: String,
    description: { type: String, maxlength: 2000 },
    foundedYear: Number,
    socialLinks: {
      linkedin: String,
      twitter: String,
      facebook: String,
      instagram: String,
    },
    // Preferences
    hiringPreferences: {
      defaultVisibility: { type: String, enum: ["public", "private"], default: "public" },
      preferredLocations: [String],
      workType: { type: String, enum: ["remote", "onsite", "hybrid", "flexible"] },
    },
    notificationPrefs: {
      emailNewApplicant: { type: Boolean, default: true },
      emailInterviewScheduled: { type: Boolean, default: true },
      emailOfferResponse: { type: Boolean, default: true },
      emailWeeklyDigest: { type: Boolean, default: true },
      inAppAll: { type: Boolean, default: true },
    },
    verificationLevel: {
      type: String,
      enum: ["basic", "company", "premium"],
      default: "basic",
    },
    verificationDocs: [String],
    verifiedAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    domainVerified: { type: Boolean, default: false },
    domainVerifiedAt: Date,
    domainVerificationToken: { type: String, select: false },
    domainVerificationSentAt: Date,
    isAgentVerified: { type: Boolean, default: false },
    verifiedByAgentId: { type: Schema.Types.ObjectId, ref: "User" },
    workflowMode: { type: String, enum: ["auto", "manual"], default: "manual" },
    workflow: { type: Schema.Types.Mixed },
    matchingWeights: { type: Schema.Types.Mixed },
    responseTimeCommitment: { type: Number, min: 1, max: 30 },
    smtpOverride: {
      smtpEmail: { type: String },
      smtpAppPassword: { type: String, select: false },
      smtpHost: { type: String, default: "smtp.gmail.com" },
      smtpPort: { type: Number, default: 587 },
      smtpSecure: { type: Boolean, default: false },
    },
    jobIds: [{ type: Schema.Types.ObjectId, ref: "Job" }],
    paymentStatus: {
      type: String,
      enum: ["active", "pending", "overdue"],
      default: "pending",
    },
    subscriptionType: { type: String, enum: ["basic", "premium"] },
  },
  { timestamps: true }
);

// Schema-level indexes removed — managed centrally in lib/db/indexes.ts

// Encrypt sensitive PII fields before saving
const EMPLOYER_PII_FIELDS = ["registrationNo", "taxId"] as const;

EmployerSchema.pre("save", function () {
  for (const field of EMPLOYER_PII_FIELDS) {
    const value = this[field];
    if (value && typeof value === "string") {
      this[field] = encryptIfPlain(value);
    }
  }
  // Encrypt SMTP app password
  if (this.smtpOverride?.smtpAppPassword) {
    this.smtpOverride.smtpAppPassword = encryptIfPlain(this.smtpOverride.smtpAppPassword);
  }
});

// Decrypt PII fields after reading from DB
function decryptEmployerPII(doc: IEmployer | null) {
  if (!doc) return doc;
  for (const field of EMPLOYER_PII_FIELDS) {
    const value = doc[field];
    if (value && typeof value === "string") {
      try { doc[field] = decrypt(value); } catch { /* already plain or corrupted */ }
    }
  }
  // Decrypt SMTP app password
  if (doc.smtpOverride?.smtpAppPassword) {
    try { doc.smtpOverride.smtpAppPassword = decrypt(doc.smtpOverride.smtpAppPassword); } catch { /* already plain or corrupted */ }
  }
  return doc;
}

EmployerSchema.post("findOne", function (doc) { decryptEmployerPII(doc); });
EmployerSchema.post("findOneAndUpdate", function (doc) { decryptEmployerPII(doc); });
EmployerSchema.post("save", function (doc) { decryptEmployerPII(doc); });

export const Employer =
  mongoose.models.Employer ||
  mongoose.model<IEmployer>("Employer", EmployerSchema);
export default Employer;
