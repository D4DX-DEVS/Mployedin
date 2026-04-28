import mongoose, { Schema, Document } from "mongoose";
import { encryptIfPlain, decrypt } from "@/lib/security/encryption";

export interface ISmtpConfig {
  smtpEmail?: string;
  smtpAppPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}

export interface ISystemSettings extends Document {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultCurrency: string;
  smtp?: ISmtpConfig;
  updatedAt: Date;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
  {
    platformName: { type: String, default: "MPLOYEDIN" },
    supportEmail: { type: String, default: "support@mployedin.com" },
    maintenanceMode: { type: Boolean, default: false },
    defaultCurrency: { type: String, default: "AED" },
    smtp: {
      smtpEmail: { type: String },
      smtpAppPassword: { type: String, select: false },
      smtpHost: { type: String, default: "smtp.gmail.com" },
      smtpPort: { type: Number, default: 587 },
      smtpSecure: { type: Boolean, default: false },
    },
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
