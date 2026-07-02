import mongoose, { Document, Schema } from "mongoose";

export interface IAgentPerformance {
  leadsGenerated: number;
  employersCreated: number;
  vacanciesPosted: number;
  jobSeekersSubmitted: number;
  interviewsScheduled: number;
  placementsCompleted: number;
}

export interface IActivityLog {
  action: string;
  targetId?: mongoose.Types.ObjectId;
  targetType?: string;
  meta?: Record<string, unknown>;
  timestamp: Date;
}

export interface IInvoiceDefaults {
  defaultCurrency?: string;
  defaultPaymentTerms?: string;
  customPaymentDays?: number;
  defaultTaxType?: string;
  defaultTaxPercent?: number;
  defaultCategory?: string;
  defaultNotes?: string;
  billingCompanyName?: string;
  billingContactPerson?: string;
  billingEmail?: string;
  billingPhone?: string;
  billingAddress?: string;
  billingCountry?: string;
  billingTaxId?: string;
}

export interface IAgent extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  superAgentId?: mongoose.Types.ObjectId;
  referralCode: string;
  assignedCityIds: mongoose.Types.ObjectId[];
  assignedStateIds: mongoose.Types.ObjectId[];
  assignedEmployerIds: mongoose.Types.ObjectId[];
  assignedJobSeekerIds: mongoose.Types.ObjectId[];
  performance: IAgentPerformance;
  activityLog: IActivityLog[];
  commissionRate?: number; // percentage
  country?: string;
  currencyCode?: string;
  timezone?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: string[];
  invoiceDefaults?: IInvoiceDefaults;
  lastDigestSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    action: { type: String, required: true },
    targetId: Schema.Types.ObjectId,
    targetType: String,
    meta: Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AgentSchema = new Schema<IAgent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    superAgentId: { type: Schema.Types.ObjectId, ref: "SuperAgent" },
    referralCode: { type: String, unique: true, sparse: true },
    assignedCityIds: [{ type: Schema.Types.ObjectId, ref: "City" }],
    assignedStateIds: [{ type: Schema.Types.ObjectId, ref: "State" }],
    assignedEmployerIds: [{ type: Schema.Types.ObjectId, ref: "Employer" }],
    assignedJobSeekerIds: [{ type: Schema.Types.ObjectId, ref: "JobSeeker" }],
    performance: {
      leadsGenerated: { type: Number, default: 0 },
      employersCreated: { type: Number, default: 0 },
      vacanciesPosted: { type: Number, default: 0 },
      jobSeekersSubmitted: { type: Number, default: 0 },
      interviewsScheduled: { type: Number, default: 0 },
      placementsCompleted: { type: Number, default: 0 },
    },
    activityLog: [ActivityLogSchema],
    commissionRate: { type: Number, default: 0 },
    country: { type: String, default: "" },
    currencyCode: { type: String, default: "AED" },
    timezone: { type: String, default: "Asia/Dubai" },
    workingHoursStart: { type: String, default: "09:00" },
    workingHoursEnd: { type: String, default: "18:00" },
    workingDays: { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    invoiceDefaults: {
      defaultCurrency: { type: String },
      defaultPaymentTerms: { type: String },
      customPaymentDays: { type: Number },
      defaultTaxType: { type: String },
      defaultTaxPercent: { type: Number },
      defaultCategory: { type: String },
      defaultNotes: { type: String, maxlength: 1000 },
      billingCompanyName: { type: String, maxlength: 200 },
      billingContactPerson: { type: String, maxlength: 200 },
      billingEmail: { type: String, maxlength: 200 },
      billingPhone: { type: String, maxlength: 50 },
      billingAddress: { type: String, maxlength: 500 },
      billingCountry: { type: String, maxlength: 5 },
      billingTaxId: { type: String, maxlength: 50 },
    },
    lastDigestSentAt: Date,
  },
  { timestamps: true }
);

// Cap activityLog to prevent unbounded growth (ponytail:)
// Keep the most recent 200 entries; move to its own collection if history queries are needed
AgentSchema.pre("save", function () {
  if (this.activityLog && this.activityLog.length > 200) {
    this.activityLog = this.activityLog.slice(-200);
  }
});

// Schema-level indexes removed — managed centrally in lib/db/indexes.ts

export const Agent =
  mongoose.models.Agent || mongoose.model<IAgent>("Agent", AgentSchema);
export default Agent;
