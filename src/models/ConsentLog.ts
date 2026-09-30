import mongoose, { Document, Schema } from "mongoose";

/**
 * Consent history — one row per change of a consent flag, so the admin GDPR
 * page can show who granted or withdrew what, when, and from where. Written at
 * sign-up (terms_and_privacy + cookies, lib/gdpr/consent.ts), on /accept-terms,
 * by the cookie banner / Data & Privacy page for signed-in users, and by the
 * job-seeker profile route when `marketingConsent` changes.
 */
export interface IConsentLog extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userName: string;
  consentType: string;
  granted: boolean;
  /** Where the change came from, e.g. "profile", "onboarding". */
  source?: string;
  /** For terms_and_privacy rows: the Terms/Privacy version that was accepted. */
  policyVersion?: string;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConsentLogSchema = new Schema<IConsentLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true, trim: true, maxlength: 200 },
    consentType: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 },
    granted: { type: Boolean, required: true },
    source: { type: String, maxlength: 60 },
    policyVersion: { type: String, maxlength: 40 },
    ipAddress: String,
  },
  { timestamps: true },
);

ConsentLogSchema.index({ createdAt: -1 });
ConsentLogSchema.index({ userId: 1, consentType: 1, createdAt: -1 });

export const ConsentLog =
  mongoose.models.ConsentLog || mongoose.model<IConsentLog>("ConsentLog", ConsentLogSchema);
export default ConsentLog;
