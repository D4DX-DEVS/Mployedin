import mongoose, { Document, Schema } from "mongoose";
import { INVOICE_STATUSES, INVOICE_TERMINAL_STATUSES, type InvoiceStatusValue } from "@/lib/invoices/status";

// ── Types ────────────────────────────────────────────────────────────────────
export type InvoiceStatus = InvoiceStatusValue;
export type InvoiceType = "new" | "renewal" | "upgrade" | "downgrade" | "recruitment" | "premium_posting" | "featured_promotion" | "exhibition" | "bulk_hiring" | "consulting" | "custom";
export type InvoiceCategory = "subscription" | "recruitment" | "premium_posting" | "featured_promotion" | "exhibition" | "bulk_hiring" | "consulting" | "custom_enterprise";
export type TaxType = "gst" | "vat" | "reverse_charge" | "none";
export type PaymentTerms = "immediate" | "net_7" | "net_15" | "net_30" | "net_45" | "net_60" | "net_90" | "custom";

// ── Line Item Interface ──────────────────────────────────────────────────────
export interface IInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  jobId?: mongoose.Types.ObjectId;
}

// ── Commission Breakdown (embedded) ──────────────────────────────────────────
export interface IInvoiceCommission {
  agentId?: mongoose.Types.ObjectId;
  superAgentId?: mongoose.Types.ObjectId;
  role: "agent" | "super_agent";
  rate: number;
  amount: number;
  status: "pending" | "approved" | "paid" | "disputed";
  paidAt?: Date;
  notes?: string;
}

// ── Payment Record (embedded) ────────────────────────────────────────────────
export interface IInvoicePayment {
  _id?: mongoose.Types.ObjectId;
  amount: number;
  paymentDate: Date;
  paymentMethod: "bank_transfer" | "cash" | "cheque" | "credit_card" | "online" | "other";
  referenceNumber?: string;
  notes?: string;
  recordedBy: mongoose.Types.ObjectId;
  createdAt?: Date;
}

// ── Billing Details (embedded) ───────────────────────────────────────────────
export interface IBillingDetails {
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  taxId?: string;
}

// ── Interface ────────────────────────────────────────────────────────────────
export interface IInvoice extends Document {
  _id: mongoose.Types.ObjectId;
  invoiceNumber: string;
  category: InvoiceCategory;
  userId: mongoose.Types.ObjectId;

  // Subscription-specific
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

  // Billing
  billingDetails?: IBillingDetails;

  // Line items
  lineItems: IInvoiceLineItem[];

  // Pricing
  type: InvoiceType;
  description?: string;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxType: TaxType;
  taxPercent: number;
  taxAmount: number;
  serviceCharge: number;
  totalAmount: number;
  amount: number; // backward compat → same as totalAmount
  currency: string;

  // Commission breakdown
  commissions: IInvoiceCommission[];
  platformRevenue: number;

  // Payment tracking
  payments: IInvoicePayment[];
  paidAmount: number;
  balanceDue: number;

  // Payment terms
  paymentTerms: PaymentTerms;
  customPaymentDays?: number;
  dueDate?: Date;

  // Status
  status: InvoiceStatus;
  issuedAt?: Date;
  paidAt?: Date;
  markedPaidBy?: mongoose.Types.ObjectId;

  // Delivery tracking
  sentAt?: Date;
  viewedAt?: Date;
  downloadedAt?: Date;
  reminderCount: number;
  lastReminderAt?: Date;

  // Employer payment notifications
  paymentNotifications: Array<{
    paymentMethod: string;
    referenceNumber?: string;
    notes?: string;
    notifiedAt: Date;
    notifiedBy: mongoose.Types.ObjectId;
    verified?: boolean;
    verifiedBy?: mongoose.Types.ObjectId;
    verifiedAt?: Date;
  }>;

  // Notes
  notes?: string;
  internalNotes?: string;

  // Billing disputes
  disputes: Array<{
    reason: string;
    category: "wrong_amount" | "tax_issue" | "duplicate" | "refund_request" | "other";
    description: string;
    status: "open" | "under_review" | "resolved" | "rejected";
    raisedAt: Date;
    raisedBy: mongoose.Types.ObjectId;
    resolvedAt?: Date;
    resolvedBy?: mongoose.Types.ObjectId;
    resolution?: string;
  }>;

  // Audit
  createdBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
  voidedBy?: mongoose.Types.ObjectId;
  voidedAt?: Date;
  voidReason?: string;

  // Credit / Refund
  refundedAmount: number;
  creditNoteNumber?: string;
  parentInvoiceId?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ──────────────────────────────────────────────────────────────
const LineItemSchema = new Schema<IInvoiceLineItem>(
  {
    description: { type: String, required: true, maxlength: 500 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
  },
  { _id: false },
);

const InvoiceCommissionSchema = new Schema<IInvoiceCommission>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    superAgentId: { type: Schema.Types.ObjectId, ref: "SuperAgent" },
    role: { type: String, enum: ["agent", "super_agent"], required: true },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["pending", "approved", "paid", "disputed", "clawed_back"], default: "pending" },
    paidAt: Date,
    notes: String,
  },
  { _id: false },
);

const PaymentSchema = new Schema<IInvoicePayment>(
  {
    amount: { type: Number, required: true, min: 0.01 },
    paymentDate: { type: Date, required: true, default: Date.now },
    paymentMethod: {
      type: String,
      enum: ["bank_transfer", "cash", "cheque", "credit_card", "online", "other"],
      default: "bank_transfer",
    },
    referenceNumber: { type: String, maxlength: 100 },
    notes: { type: String, maxlength: 500 },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const BillingDetailsSchema = new Schema<IBillingDetails>(
  {
    companyName: { type: String, maxlength: 200 },
    contactPerson: { type: String, maxlength: 200 },
    email: { type: String, maxlength: 254 },
    phone: { type: String, maxlength: 20 },
    address: { type: String, maxlength: 500 },
    city: { type: String, maxlength: 100 },
    state: { type: String, maxlength: 100 },
    country: { type: String, maxlength: 100 },
    postalCode: { type: String, maxlength: 20 },
    taxId: { type: String, maxlength: 50 },
  },
  { _id: false },
);

// ── Main Schema ──────────────────────────────────────────────────────────────
const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    category: { type: String, enum: ["subscription", "recruitment", "premium_posting", "featured_promotion", "exhibition", "bulk_hiring", "consulting", "custom_enterprise"], default: "subscription" },
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

    // Billing
    billingDetails: BillingDetailsSchema,

    // Line items
    lineItems: { type: [LineItemSchema], default: [] },

    // Pricing
    type: { type: String, enum: ["new", "renewal", "upgrade", "downgrade", "recruitment", "premium_posting", "featured_promotion", "exhibition", "bulk_hiring", "consulting", "custom"], required: true },
    description: String,
    subtotal: { type: Number, required: true, min: 0, default: 0 },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    taxType: { type: String, enum: ["gst", "vat", "reverse_charge", "none"], default: "none" },
    taxPercent: { type: Number, min: 0, max: 100, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    serviceCharge: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "AED" },

    // Commission
    commissions: { type: [InvoiceCommissionSchema], default: [] },
    platformRevenue: { type: Number, min: 0, default: 0 },

    // Payments
    payments: { type: [PaymentSchema], default: [] },
    paidAmount: { type: Number, min: 0, default: 0 },
    balanceDue: { type: Number, min: 0, default: 0 },

    // Payment terms
    paymentTerms: {
      type: String,
      enum: ["immediate", "net_7", "net_15", "net_30", "net_45", "net_60", "net_90", "custom"],
      default: "net_30",
    },
    customPaymentDays: Number,
    dueDate: Date,

    // Status
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      default: "issued",
    },
    issuedAt: Date,
    paidAt: Date,
    markedPaidBy: { type: Schema.Types.ObjectId, ref: "User" },

    // Delivery tracking
    sentAt: Date,
    viewedAt: Date,
    downloadedAt: Date,
    reminderCount: { type: Number, min: 0, default: 0 },
    lastReminderAt: Date,

    // Employer payment notifications
    paymentNotifications: [{
      paymentMethod: { type: String, maxlength: 50 },
      referenceNumber: { type: String, maxlength: 200 },
      notes: { type: String, maxlength: 500 },
      notifiedAt: { type: Date, default: Date.now },
      notifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
      verified: { type: Boolean, default: false },
      verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
      verifiedAt: Date,
    }],

    // Notes
    notes: String,
    internalNotes: String,

    // Billing disputes
    disputes: [{
      reason: { type: String, required: true, maxlength: 200 },
      category: {
        type: String,
        enum: ["wrong_amount", "tax_issue", "duplicate", "refund_request", "other"],
        default: "other",
      },
      description: { type: String, maxlength: 1000 },
      status: {
        type: String,
        enum: ["open", "under_review", "resolved", "rejected"],
        default: "open",
      },
      raisedAt: { type: Date, default: Date.now },
      raisedBy: { type: Schema.Types.ObjectId, ref: "User" },
      resolvedAt: Date,
      resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
      resolution: { type: String, maxlength: 1000 },
    }],

    // Audit
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    rejectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectedAt: Date,
    rejectionReason: String,
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidedAt: Date,
    voidReason: String,

    // Credit / Refund
    refundedAmount: { type: Number, min: 0, default: 0 },
    creditNoteNumber: String,
    parentInvoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
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
InvoiceSchema.index({ dueDate: 1, status: 1 });
InvoiceSchema.index({ invoiceNumber: 1 });

// ── Pre-save: auto-calculate totals ──────────────────────────────────────────
InvoiceSchema.pre("save", function () {
  // Subtotal from line items if present
  if (this.lineItems && this.lineItems.length > 0) {
    this.subtotal = this.lineItems.reduce((sum, item) => sum + item.amount, 0);
  }

  // Discount
  this.discountAmount = Math.round((this.subtotal * (this.discountPercent || 0)) / 100 * 100) / 100;
  const afterDiscount = this.subtotal - this.discountAmount;

  // Tax
  this.taxAmount = Math.round((afterDiscount * (this.taxPercent || 0)) / 100 * 100) / 100;

  // Total
  this.totalAmount = Math.round((afterDiscount + this.taxAmount + (this.serviceCharge || 0)) * 100) / 100;
  this.amount = this.totalAmount;

  // Paid & balance
  this.paidAmount = (this.payments || []).reduce((sum, p) => sum + p.amount, 0);
  this.balanceDue = Math.max(0, Math.round((this.totalAmount - this.paidAmount - (this.refundedAmount || 0)) * 100) / 100);

  // Platform revenue
  const totalCommission = (this.commissions || []).reduce((sum, c) => sum + c.amount, 0);
  this.platformRevenue = Math.round((this.totalAmount - totalCommission) * 100) / 100;

  // Auto-update status based on payments
  if (!(INVOICE_TERMINAL_STATUSES as readonly string[]).includes(this.status)) {
    if (this.paidAmount >= this.totalAmount && this.totalAmount > 0) {
      this.status = "paid";
      if (!this.paidAt) this.paidAt = new Date();
    } else if (this.paidAmount > 0 && this.paidAmount < this.totalAmount) {
      this.status = "partially_paid";
    }
  }

  // Due date from payment terms
  if (!this.dueDate && this.issuedAt) {
    const daysMap: Record<string, number> = {
      immediate: 0, net_7: 7, net_15: 15, net_30: 30, net_45: 45, net_60: 60, net_90: 90,
    };
    const days = this.paymentTerms === "custom"
      ? (this.customPaymentDays || 30)
      : (daysMap[this.paymentTerms] ?? 30);
    const due = new Date(this.issuedAt);
    due.setDate(due.getDate() + days);
    this.dueDate = due;
  }
});

export const Invoice =
  mongoose.models.Invoice ||
  mongoose.model<IInvoice>("Invoice", InvoiceSchema);
export default Invoice;
