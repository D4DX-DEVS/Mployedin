import mongoose, { Document, Schema } from "mongoose";
import type { ReferralAudience } from "@/lib/referrals/url";

export interface IReferralRegistration {
  /** Missing on rows written before job-seeker links existed → employer. */
  kind?: "employer" | "job_seeker";
  employerId?: mongoose.Types.ObjectId;
  jobSeekerId?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  companyName?: string;
  /** Seeker display name (job_seeker rows). */
  name?: string;
  email: string;
  country?: string;
  city?: string;
  registeredAt: Date;
}

export interface IReferralLink extends Document {
  _id: mongoose.Types.ObjectId;
  code: string;
  createdBy: mongoose.Types.ObjectId; // userId of agent/super-agent
  creatorRole: "agent" | "super_agent";
  /** Who the link signs up. Missing on old documents → "employer". */
  audience: ReferralAudience;
  agentId?: mongoose.Types.ObjectId; // Agent doc _id (if creator is agent)
  superAgentId?: mongoose.Types.ObjectId; // SuperAgent doc _id (if creator is super-agent)
  label?: string; // optional friendly name e.g. "LinkedIn Campaign Q2"
  expiresAt?: Date;
  maxUses: number; // 0 = unlimited
  usedCount: number;
  registrations: IReferralRegistration[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralRegistrationSchema = new Schema<IReferralRegistration>(
  {
    kind: { type: String, enum: ["employer", "job_seeker"], default: "employer" },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer" },
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "JobSeeker" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    companyName: { type: String },
    name: { type: String },
    email: { type: String, required: true },
    country: String,
    city: String,
    registeredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ReferralLinkSchema = new Schema<IReferralLink>(
  {
    code: { type: String, required: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    creatorRole: { type: String, enum: ["agent", "super_agent"], required: true },
    audience: { type: String, enum: ["employer", "job_seeker"], default: "employer" },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    superAgentId: { type: Schema.Types.ObjectId, ref: "SuperAgent" },
    label: { type: String, trim: true, maxlength: 100 },
    expiresAt: Date,
    maxUses: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    registrations: [ReferralRegistrationSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ReferralLinkSchema.index({ createdBy: 1 });
ReferralLinkSchema.index({ agentId: 1 });
ReferralLinkSchema.index({ superAgentId: 1 });
ReferralLinkSchema.index({ expiresAt: 1 });

// Cap registrations array to prevent unbounded growth (ponytail:)
ReferralLinkSchema.pre("save", function () {
  if (this.registrations && this.registrations.length > 5000) {
    // Keep only the most recent 5000 registrations
    this.registrations = this.registrations.slice(-5000);
  }
});

export const ReferralLink =
  mongoose.models.ReferralLink ||
  mongoose.model<IReferralLink>("ReferralLink", ReferralLinkSchema);
export default ReferralLink;
