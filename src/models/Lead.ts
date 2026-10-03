import mongoose, { Document, Schema } from "mongoose";
import {
  CONTACT_METHODS,
  FOLLOW_UP_TYPES,
  HIRING_RANGES,
  LOST_REASONS,
  type ContactMethod,
  type FollowUpType,
  type HiringRange,
  type LostReasonCode,
} from "@/lib/leads/stageRules";

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
  /** Free-text detail; the category the agent picked is `lostReasonCode`. */
  lostReason?: string;
  lostReasonCode?: LostReasonCode;
  lostAt?: Date;
  source?: string;
  notes?: string;
  /** The roles the employer is hiring for, in the agent's words. */
  requirement?: string;
  expectedHiring?: HiringRange;
  followUpAt?: Date;
  followUpType?: FollowUpType;
  /** What the follow-up is for ("Send proposal"). */
  followUpNote?: string;
  /** Kept on the lead so the card and the Contacted rule need no log scan. */
  lastContactedAt?: Date;
  lastContactMethod?: ContactMethod;
  /** The deal's final value; `expectedRevenue` stays the estimate. */
  wonValue?: number;
  /** When the lead was Won (set by the Move dialog, or by conversion). */
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
    /** Set on "stage_change" entries. */
    fromStatus?: LeadStatus;
    toStatus?: LeadStatus;
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
    lostReasonCode: { type: String, enum: LOST_REASONS },
    lostAt: Date,
    source: String,
    notes: String,
    requirement: { type: String, maxlength: 500, trim: true },
    expectedHiring: { type: String, enum: HIRING_RANGES },
    followUpAt: Date,
    followUpType: { type: String, enum: FOLLOW_UP_TYPES },
    followUpNote: { type: String, maxlength: 200, trim: true },
    lastContactedAt: Date,
    lastContactMethod: { type: String, enum: CONTACT_METHODS },
    wonValue: { type: Number, min: 0 },
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
        fromStatus: String,
        toStatus: String,
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
