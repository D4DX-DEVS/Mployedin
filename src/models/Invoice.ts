import mongoose, { Document, Schema } from "mongoose";

// ── Types ────────────────────────────────────────────────────────────────────
export type InvoiceStatus = "draft" | "issued" | "paid" | "void";
export type InvoiceType = "new" | "renewal" | "upgrade" | "downgrade" | "recruitment";
export type InvoiceCategory = "subscription" | "recruitment";

// ── Interface ────────────────────────────────────────────────────────────────
export interface IInvoice extends Document {
  _id: mongoose.Types.ObjectId;
  invoiceNumber: string;
  category: InvoiceCategory;
  userId: mongoose.Types.ObjectId;
  // Subscription-specific (optional for recruitment invoices)
  subscriptionId?: mongoose.Types.ObjectId;
  planId?: mongoose.Types.ObjectId;
  planName?: string;
  billingCycle?: string;
  periodStart?: Date;
  periodEnd?: Date;
  // Recruitment-specific
  jobId?: mongoose.Types.ObjectId;
  employerId?: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  type: InvoiceType;
  description?: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt: Date;
  paidAt?: Date;
  markedPaidBy?: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ───────────────────────────────────────────────────────────────────
const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    category: {
      type: String,
      enum: ["subscription", "recruitment"],
      default: "subscription",
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Subscription-specific
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription" },
    planId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan" },
    planName: String,
    billingCycle: String,
    periodStart: Date,
    periodEnd: Date,
    // Recruitment-specific
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer" },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    type: {
      type: String,
      enum: ["new", "renewal", "upgrade", "downgrade", "recruitment"],
      required: true,
    },
    description: String,
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "AED" },
    status: {
      type: String,
      enum: ["draft", "issued", "paid", "void"],
      default: "issued",
    },
    issuedAt: { type: Date, required: true, default: Date.now },
    paidAt: Date,
    markedPaidBy: { type: Schema.Types.ObjectId, ref: "User" },
    notes: String,
  },
  { timestamps: true },
);

InvoiceSchema.index({ userId: 1, createdAt: -1 });
InvoiceSchema.index({ subscriptionId: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ category: 1 });
InvoiceSchema.index({ jobId: 1 });
InvoiceSchema.index({ employerId: 1 });
InvoiceSchema.index({ agentId: 1 });

export const Invoice =
  mongoose.models.Invoice ||
  mongoose.model<IInvoice>("Invoice", InvoiceSchema);
export default Invoice;
