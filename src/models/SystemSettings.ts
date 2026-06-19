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

export interface ISystemSettings extends Document {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultCurrency: string;
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
