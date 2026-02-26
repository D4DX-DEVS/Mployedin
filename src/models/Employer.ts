import mongoose, { Document, Schema } from "mongoose";

export type VerificationLevel = "basic" | "company" | "premium";
export type WorkflowMode = "auto" | "manual";

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
  // Verification
  verificationLevel: VerificationLevel;
  verificationDocs: string[];
  verifiedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  // Settings
  workflowMode: WorkflowMode;
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
    verificationLevel: {
      type: String,
      enum: ["basic", "company", "premium"],
      default: "basic",
    },
    verificationDocs: [String],
    verifiedAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    workflowMode: { type: String, enum: ["auto", "manual"], default: "manual" },
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

EmployerSchema.index({ userId: 1 }, { unique: true });
EmployerSchema.index({ agentId: 1 });
EmployerSchema.index({ verificationLevel: 1 });
EmployerSchema.index({ paymentStatus: 1 });

export const Employer =
  mongoose.models.Employer ||
  mongoose.model<IEmployer>("Employer", EmployerSchema);
export default Employer;
