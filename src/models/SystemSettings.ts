import mongoose, { Schema, Document } from "mongoose";
import { encryptIfPlain, decrypt } from "@/lib/security/encryption";

export interface ISmtpConfig {
  smtpEmail?: string;
  smtpAppPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}

export interface ICommissionOverride {
  countryCode: string;
  /** Fallback rate applied to both roles when agentRate/superAgentRate are not specified */
  rate: number;
  /** Role-specific override for agents (takes priority over `rate`) */
  agentRate?: number;
  /** Role-specific override for super-agents (takes priority over `rate`) */
  superAgentRate?: number;
  label?: string;
}

/**
 * The party that issues invoices — printed as the FROM block on every PDF.
 *
 * Invoices used to carry only a logo: no legal name, no registered address, no
 * tax registration and no way for the payer to know where to send money. All
 * of it is editable here rather than compiled in, because a legal entity's
 * address or tax number changing should not need a deploy.
 */
export interface IInvoiceBankDetails {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  iban?: string;
  swift?: string;
  branch?: string;
  /** Free-form extra instruction, e.g. "Quote the invoice number as reference". */
  instructions?: string;
}

export interface IInvoiceIssuer {
  legalName?: string;
  addressLines?: string[];
  country?: string;
  taxRegNo?: string;
  email?: string;
  phone?: string;
  website?: string;
  bank?: IInvoiceBankDetails;
  /** Replaces the generic "computer-generated invoice" footer when set. */
  footerNote?: string;
}

export interface ISystemSettings extends Document {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultCurrency: string;
  invoiceIssuer?: IInvoiceIssuer;
  /** When false (default), subscription enforcement is bypassed and all users get full access.
   *  Flip to true once payment integration is live to enforce plan limits / feature gates. */
  subscriptionEnforcementEnabled: boolean;
  smtp?: ISmtpConfig;
  commissionOverrides?: ICommissionOverride[];
  updatedAt: Date;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
  {
    platformName: { type: String, default: "MPLOYEDIN" },
    supportEmail: { type: String, default: "support@mployedin.com" },
    maintenanceMode: { type: Boolean, default: false },
    defaultCurrency: { type: String, default: "AED" },
    subscriptionEnforcementEnabled: { type: Boolean, default: false },
    smtp: {
      smtpEmail: { type: String },
      smtpAppPassword: { type: String, select: false },
      smtpHost: { type: String, default: "smtp.gmail.com" },
      smtpPort: { type: Number, default: 587 },
      smtpSecure: { type: Boolean, default: false },
    },
    invoiceIssuer: {
      legalName: { type: String, maxlength: 200 },
      addressLines: { type: [String], default: undefined },
      country: { type: String, maxlength: 60 },
      taxRegNo: { type: String, maxlength: 60 },
      email: { type: String, maxlength: 254 },
      phone: { type: String, maxlength: 50 },
      website: { type: String, maxlength: 2048 },
      bank: {
        bankName: { type: String, maxlength: 200 },
        accountName: { type: String, maxlength: 200 },
        accountNumber: { type: String, maxlength: 60 },
        iban: { type: String, maxlength: 60 },
        swift: { type: String, maxlength: 30 },
        branch: { type: String, maxlength: 200 },
        instructions: { type: String, maxlength: 500 },
      },
      footerNote: { type: String, maxlength: 300 },
    },
    commissionOverrides: [
      {
        countryCode: { type: String, required: true, maxlength: 5 },
        rate: { type: Number, required: true, min: 0, max: 100 },
        agentRate: { type: Number, min: 0, max: 100 },
        superAgentRate: { type: Number, min: 0, max: 100 },
        label: { type: String, maxlength: 100 },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

// Encrypt SMTP app password before saving
SystemSettingsSchema.pre("save", function () {
  if (this.smtp?.smtpAppPassword) {
    this.smtp.smtpAppPassword = encryptIfPlain(this.smtp.smtpAppPassword);
  }
});

// Decrypt SMTP app password after reading
function decryptSmtp(doc: ISystemSettings | null) {
  if (!doc?.smtp?.smtpAppPassword) return doc;
  try { doc.smtp.smtpAppPassword = decrypt(doc.smtp.smtpAppPassword); } catch { /* already plain or corrupted */ }
  return doc;
}

SystemSettingsSchema.post("findOne", function (doc) { decryptSmtp(doc); });
SystemSettingsSchema.post("findOneAndUpdate", function (doc) { decryptSmtp(doc); });

export const SystemSettings =
  mongoose.models.SystemSettings ||
  mongoose.model<ISystemSettings>("SystemSettings", SystemSettingsSchema);

export default SystemSettings;
