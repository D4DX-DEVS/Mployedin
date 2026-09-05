import mongoose, { Document, Schema } from "mongoose";

/**
 * Consent history — one row per change of a consent flag, so the admin GDPR
 * page can show who granted or withdrew what, when, and from where. Written by
 * the job-seeker profile route when `marketingConsent` changes; extend
 * `consentType` as more consents are captured server-side.
 */
export interface IConsentLog extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userName: string;
  consentType: string;
  granted: boolean;
  /** Where the change came from, e.g. "profile", "onboarding". */
  source?: string;
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
    ipAddress: String,
  },
  { timestamps: true },
);

ConsentLogSchema.index({ createdAt: -1 });
ConsentLogSchema.index({ userId: 1, consentType: 1, createdAt: -1 });

export const ConsentLog =
  mongoose.models.ConsentLog || mongoose.model<IConsentLog>("ConsentLog", ConsentLogSchema);
export default ConsentLog;
