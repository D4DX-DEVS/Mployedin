import mongoose, { Document, Schema } from "mongoose";

export type LeadStatus =
  | "new"
  | "contacted"
  | "interested"
  | "negotiating"
  | "converted"
  | "lost";

export interface ILead extends Document {
  _id: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  superAgentId?: mongoose.Types.ObjectId;
  // Contact info
  companyName: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  industry?: string;
  // Lead details
  status: LeadStatus;
  source?: string;
  notes?: string;
  followUpAt?: Date;
  convertedAt?: Date;
  convertedToEmployerId?: mongoose.Types.ObjectId;
  // Activity
  activityLog: {
    action: string;
    note?: string;
    timestamp: Date;
    by?: mongoose.Types.ObjectId;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    superAgentId: { type: Schema.Types.ObjectId, ref: "SuperAgent" },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true },
    contactEmail: String,
    contactPhone: String,
    country: String,
    industry: String,
    status: {
      type: String,
      enum: [
        "new",
        "contacted",
        "interested",
        "negotiating",
        "converted",
        "lost",
      ],
      default: "new",
    },
    source: String,
    notes: String,
    followUpAt: Date,
    convertedAt: Date,
    convertedToEmployerId: { type: Schema.Types.ObjectId, ref: "Employer" },
    activityLog: [
      {
        action: String,
        note: String,
        timestamp: { type: Date, default: Date.now },
        by: Schema.Types.ObjectId,
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

LeadSchema.index({ agentId: 1 });
LeadSchema.index({ superAgentId: 1 });
LeadSchema.index({ status: 1 });
LeadSchema.index({ followUpAt: 1 });

export const Lead =
  mongoose.models.Lead || mongoose.model<ILead>("Lead", LeadSchema);
export default Lead;
