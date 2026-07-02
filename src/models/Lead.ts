import mongoose, { Document, Schema } from "mongoose";

export type LeadStatus =
  | "new"
  | "contacted"
  | "interested"
  | "negotiating"
  | "converted"
  | "lost";

export type LeadQualification = "cold" | "warm" | "hot" | "qualified";

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
  city?: string;
  industry?: string;
  // Scoring
  score: number;
  qualificationLevel: LeadQualification;
  expectedRevenue?: number;
  expectedRevenueCurrency: string;
  // Lead details
  status: LeadStatus;
  lostReason?: string;
  source?: string;
  notes?: string;
  followUpAt?: Date;
  convertedAt?: Date;
  convertedToEmployerId?: mongoose.Types.ObjectId;
  // Auto-routing
  territoryId?: mongoose.Types.ObjectId;
  autoRouted: boolean;
  // Exhibition link
  exhibitionId?: mongoose.Types.ObjectId;
  // Activity
  activityLog: {
    action: string;
    note?: string;
    timestamp: Date;
    by?: mongoose.Types.ObjectId;
  }[];
  lastFollowupReminderAt?: Date;
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
    city: String,
    industry: String,
    score: { type: Number, default: 0, min: 0, max: 100 },
    qualificationLevel: {
      type: String,
      enum: ["cold", "warm", "hot", "qualified"],
      default: "cold",
    },
    expectedRevenue: { type: Number, min: 0 },
    expectedRevenueCurrency: { type: String, default: "AED", maxlength: 3 },
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
    lostReason: { type: String, maxlength: 500 },
    source: String,
    notes: String,
    followUpAt: Date,
    convertedAt: Date,
    convertedToEmployerId: { type: Schema.Types.ObjectId, ref: "Employer" },
    territoryId: { type: Schema.Types.ObjectId, ref: "Territory" },
    autoRouted: { type: Boolean, default: false },
    exhibitionId: { type: Schema.Types.ObjectId, ref: "ExhibitionRequest" },
    activityLog: [
      {
        action: String,
        note: String,
        timestamp: { type: Date, default: Date.now },
        by: Schema.Types.ObjectId,
        _id: false,
      },
    ],
    lastFollowupReminderAt: Date,
  },
  { timestamps: true }
);

LeadSchema.index({ agentId: 1 });
LeadSchema.index({ superAgentId: 1 });
LeadSchema.index({ status: 1 });
LeadSchema.index({ followUpAt: 1 });
LeadSchema.index({ country: 1 });
LeadSchema.index({ territoryId: 1 });
LeadSchema.index({ exhibitionId: 1 });
LeadSchema.index({ qualificationLevel: 1, status: 1 });
LeadSchema.index({ score: -1 });

export const Lead =
  mongoose.models.Lead || mongoose.model<ILead>("Lead", LeadSchema);
export default Lead;
