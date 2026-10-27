import mongoose, { Document, Schema } from "mongoose";
import { d1LogMirror } from "@/lib/logs/logStore";

/**
 * Consent history — one row per change of a consent flag, so the admin GDPR
 * page can show who granted or withdrew what, when, and from where. Written at
 * sign-up (terms_and_privacy + cookies, lib/gdpr/consent.ts), on /accept-terms,
 * by the cookie banner / Data & Privacy page for signed-in users, and by the
 * job-seeker profile route when `marketingConsent` changes.
 *
 * Cookie rows (`cookies.preferences`, `cookies.media`) carry `receiptId`: the
 * visitor's choice reference, which ties the row to the anonymous
 * ConsentReceipt that proves what wording they saw. Older rows, terms and
 * marketing rows have none.
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
  /** Cookie rows: the choice reference (ConsentReceipt.receiptId) this row was written with. */
  receiptId?: string;
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
    receiptId: { type: String, trim: true, maxlength: 36 },
    ipAddress: String,
  },
  { timestamps: true },
);

ConsentLogSchema.index({ createdAt: -1 });
ConsentLogSchema.index({ userId: 1, consentType: 1, createdAt: -1 });
// Admin lookup / search by choice reference; sparse, because most rows have none.
ConsentLogSchema.index({ receiptId: 1 }, { sparse: true });
// One row per account, choice reference and category: the receipt route checks then inserts, which is not atomic,
// so a resend racing the first delivery is stopped here (recordCookieConsent treats the duplicate key as done).
// Only over rows that have a reference: terms, marketing and older rows repeat legitimately. Existing duplicates are
// removed by scripts/consent-receipt-unique-index.mjs before this can build (indexes.ts logs it until then).
ConsentLogSchema.index(
  { userId: 1, receiptId: 1, consentType: 1 },
  { unique: true, partialFilterExpression: { receiptId: { $type: "string" } } },
);

// LOGS_STORE=dual: every insert is also copied to D1 (lib/logs/logStore.ts).
ConsentLogSchema.plugin(d1LogMirror("consent_log"));

export const ConsentLog =
  mongoose.models.ConsentLog || mongoose.model<IConsentLog>("ConsentLog", ConsentLogSchema);
export default ConsentLog;
