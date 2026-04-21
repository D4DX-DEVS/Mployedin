import mongoose, { Document, Schema } from "mongoose";

// ── Types ────────────────────────────────────────────────────────────────────
export type InvoiceStatus = "draft" | "issued" | "paid" | "void";
export type InvoiceType = "new" | "renewal" | "upgrade" | "downgrade";

// ── Interface ────────────────────────────────────────────────────────────────
export interface IInvoice extends Document {
  _id: mongoose.Types.ObjectId;
  invoiceNumber: string;
  userId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  type: InvoiceType;
  planName: string;
  description?: string;
  amount: number;
  currency: string;
  billingCycle: string;
  periodStart: Date;
  periodEnd: Date;
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
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", required: true },
    planId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
    type: {
      type: String,
      enum: ["new", "renewal", "upgrade", "downgrade"],
      required: true,
    },
    planName: { type: String, required: true },
    description: String,
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "AED" },
    billingCycle: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
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

export const Invoice =
  mongoose.models.Invoice ||
  mongoose.model<IInvoice>("Invoice", InvoiceSchema);
export default Invoice;
