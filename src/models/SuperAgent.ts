import mongoose, { Document, Schema } from "mongoose";

export interface ISAInvoiceDefaults {
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

export interface ISuperAgent extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;  referralCode: string;  assignedCityIds: mongoose.Types.ObjectId[];
  assignedStateIds: mongoose.Types.ObjectId[];
  agentIds: mongoose.Types.ObjectId[];
  commissions: {
    total: number;
    pending: number;
    paid: number;
  };
  overrideRate?: number; // commission override %
  defaultAgentCommissionRate?: number; // default commission for agents under this SA
  country?: string;
  currencyCode?: string;
  timezone?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: string[];
  invoiceDefaults?: ISAInvoiceDefaults;
  createdAt: Date;
  updatedAt: Date;
}

const SuperAgentSchema = new Schema<ISuperAgent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    referralCode: { type: String, unique: true, sparse: true },
    assignedCityIds: [{ type: Schema.Types.ObjectId, ref: "City" }],
    assignedStateIds: [{ type: Schema.Types.ObjectId, ref: "State" }],
    agentIds: [{ type: Schema.Types.ObjectId, ref: "Agent" }],
    commissions: {
      total: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      paid: { type: Number, default: 0 },
    },
    overrideRate: { type: Number, default: 0 },
    defaultAgentCommissionRate: { type: Number, default: 0 },
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
  },
  { timestamps: true }
);

SuperAgentSchema.index({ userId: 1 }, { unique: true });
SuperAgentSchema.index({ assignedCityIds: 1 });
SuperAgentSchema.index({ assignedStateIds: 1 });

export const SuperAgent =
  mongoose.models.SuperAgent ||
  mongoose.model<ISuperAgent>("SuperAgent", SuperAgentSchema);
export default SuperAgent;
