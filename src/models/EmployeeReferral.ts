import mongoose, { Document, Schema } from "mongoose";

export type ReferralStatus = "pending" | "applied" | "interviewed" | "hired" | "rejected" | "expired";

export interface IEmployeeReferral extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  referrerId: mongoose.Types.ObjectId; // CompanyUser who referred
  referrerName: string;
  referrerEmail: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  candidateResumeUrl?: string;
  jobId?: mongoose.Types.ObjectId;
  jobTitle?: string;
  relationship: string;
  notes?: string;
  status: ReferralStatus;
  applicationId?: mongoose.Types.ObjectId;
  rewardAmount?: number;
  rewardCurrency?: string;
  rewardPaidAt?: Date;
  hiredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferralProgram extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  rewardAmount: number;
  rewardCurrency: string;
  rewardCondition: "on_hire" | "after_probation" | "on_interview";
  probationDays?: number;
  isActive: boolean;
  eligibleRoles: string[]; // which company roles can refer
  maxReferralsPerEmployee?: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeReferralSchema = new Schema<IEmployeeReferral>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    referrerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    referrerName: { type: String, required: true },
    referrerEmail: { type: String, required: true },
    candidateName: { type: String, required: true, trim: true, maxlength: 100 },
    candidateEmail: { type: String, required: true, trim: true },
    candidatePhone: { type: String, maxlength: 20 },
    candidateResumeUrl: String,
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
    jobTitle: String,
    relationship: { type: String, required: true, maxlength: 100 },
    notes: { type: String, maxlength: 500 },
    status: { type: String, enum: ["pending", "applied", "interviewed", "hired", "rejected", "expired"], default: "pending" },
    applicationId: { type: Schema.Types.ObjectId, ref: "Application" },
    rewardAmount: Number,
    rewardCurrency: { type: String, default: "USD" },
    rewardPaidAt: Date,
    hiredAt: Date,
  },
  { timestamps: true }
);

EmployeeReferralSchema.index({ employerId: 1, status: 1 });
EmployeeReferralSchema.index({ referrerId: 1 });
EmployeeReferralSchema.index({ candidateEmail: 1 });

const ReferralProgramSchema = new Schema<IReferralProgram>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    rewardAmount: { type: Number, required: true, min: 0 },
    rewardCurrency: { type: String, default: "USD" },
    rewardCondition: { type: String, enum: ["on_hire", "after_probation", "on_interview"], default: "on_hire" },
    probationDays: { type: Number, default: 90 },
    isActive: { type: Boolean, default: true },
    eligibleRoles: [{ type: String }],
    maxReferralsPerEmployee: { type: Number, default: 0 }, // 0 = unlimited
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ReferralProgramSchema.index({ employerId: 1 });

export const ReferralProgram =
  mongoose.models.ReferralProgram || mongoose.model<IReferralProgram>("ReferralProgram", ReferralProgramSchema);

export default mongoose.models.EmployeeReferral || mongoose.model<IEmployeeReferral>("EmployeeReferral", EmployeeReferralSchema);
