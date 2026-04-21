import mongoose, { Document, Schema } from "mongoose";

export interface IReferralRegistration {
  employerId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  companyName: string;
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
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    companyName: { type: String, required: true },
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
ReferralLinkSchema.index({ code: 1 }, { unique: true });
ReferralLinkSchema.index({ expiresAt: 1 });

export const ReferralLink =
  mongoose.models.ReferralLink ||
  mongoose.model<IReferralLink>("ReferralLink", ReferralLinkSchema);
export default ReferralLink;
