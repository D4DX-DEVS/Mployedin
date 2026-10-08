import mongoose, { Document, Schema } from "mongoose";

/**
 * Append-only proof of cookie consent (GDPR art 7(1): the controller must be
 * able to demonstrate consent). One row per choice a visitor makes — accept,
 * reject, custom, withdraw — keyed by the pseudonymous id held in the
 * `mp_consent` cookie, and linked to the account when the visitor is signed in.
 *
 * Data minimisation: no raw IP address is stored, only a salted hash of the
 * truncated address (enough to spot abuse, not to identify the visitor), and
 * the user agent is capped. Rows expire automatically after the retention
 * period below — long enough to cover the consent lifetime plus the usual
 * limitation period for complaints.
 */
export const COOKIE_CONSENT_RETENTION_DAYS = 3 * 365;

export interface ICookieConsentRecord extends Document {
  _id: mongoose.Types.ObjectId;
  consentId: string;
  userId?: mongoose.Types.ObjectId;
  policyVersion: string;
  choices: { necessary: true; functional: boolean; analytics: boolean; marketing: boolean };
  method: "accept_all" | "reject_all" | "custom" | "withdraw" | "gpc";
  gpc: boolean;
  locale?: string;
  pageUrl?: string;
  userAgent?: string;
  ipHash?: string;
  country?: string;
  createdAt: Date;
}

const CookieConsentRecordSchema = new Schema<ICookieConsentRecord>(
  {
    consentId: { type: String, required: true, maxlength: 64 },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: { sparse: true } },
    policyVersion: { type: String, required: true, maxlength: 20 },
    choices: {
      necessary: { type: Boolean, default: true },
      functional: { type: Boolean, required: true },
      analytics: { type: Boolean, required: true },
      marketing: { type: Boolean, required: true },
    },
    method: {
      type: String,
      required: true,
      enum: ["accept_all", "reject_all", "custom", "withdraw", "gpc"],
    },
    gpc: { type: Boolean, default: false },
    locale: { type: String, maxlength: 10 },
    pageUrl: { type: String, maxlength: 300 },
    userAgent: { type: String, maxlength: 300 },
    ipHash: { type: String, maxlength: 64 },
    country: { type: String, maxlength: 2 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CookieConsentRecordSchema.index({ consentId: 1, createdAt: -1 });
CookieConsentRecordSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: COOKIE_CONSENT_RETENTION_DAYS * 24 * 60 * 60, name: "cookie_consent_ttl" },
);

export const CookieConsentRecord =
  (mongoose.models.CookieConsentRecord as mongoose.Model<ICookieConsentRecord>) ||
  mongoose.model<ICookieConsentRecord>("CookieConsentRecord", CookieConsentRecordSchema);
export default CookieConsentRecord;
