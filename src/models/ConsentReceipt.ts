import mongoose, { Document, Model, Schema } from "mongoose";

/**
 * Evidence of a cookie choice: one row per Reject all / Accept all / Save
 * choices, written by POST /api/consent/receipt only after it has checked that
 * the request's own `mpl_consent` cookie holds the same choice.
 *
 * Minimised on purpose. `receiptId` is the random id inside the visitor's
 * `mpl_consent` cookie (shown to them in Cookie settings as "Your choice
 * reference", so they can quote it); with the text hash it proves what was
 * shown and chosen without saying who chose it. `source` says where it was
 * chosen (the banner or the Cookie settings dialog): a fact about the page, not
 * about the person, so it is no personal data either; receipts written before
 * it was stored have none. No IP address, user agent or user id is stored
 * here. A signed-in user's choice is also written to their account's
 * ConsentLog, which follows the account's retention instead.
 */
export interface IConsentReceipt extends Document {
  receiptId: string;
  preferences: boolean;
  media: boolean;
  /** CONSENT_VERSION the choice was made under. */
  version: number;
  /** sha256 of the banner + Cookie settings text in `locale` (lib/consent/bannerTextHash). */
  bannerTextHash: string;
  locale: "en" | "ar";
  /** Where the choice was made. Optional: older receipts have none. */
  source?: "banner" | "settings";
  createdAt: Date;
}

// [LEGAL] consent lifetime + 6 months; owner/solicitor to confirm
export const CONSENT_RECEIPT_TTL_S = 365 * 24 * 60 * 60;

const ConsentReceiptSchema = new Schema<IConsentReceipt>(
  {
    receiptId: { type: String, required: true, trim: true, maxlength: 36 },
    preferences: { type: Boolean, required: true },
    media: { type: Boolean, required: true },
    version: { type: Number, required: true, min: 1 },
    bannerTextHash: { type: String, required: true, maxlength: 64 },
    locale: { type: String, required: true, enum: ["en", "ar"] },
    source: { type: String, enum: ["banner", "settings"] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One receipt per choice reference. The route upserts on it, so a receipt the client sends again (a retry
// after a failed delivery) is stored once. Existing databases get this index from
// scripts/consent-receipt-unique-index.mjs, which removes duplicates first.
ConsentReceiptSchema.index({ receiptId: 1 }, { unique: true });

// MongoDB TTL index: receipts delete themselves CONSENT_RECEIPT_TTL_S after they are written.
ConsentReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: CONSENT_RECEIPT_TTL_S });

export const ConsentReceipt: Model<IConsentReceipt> =
  mongoose.models.ConsentReceipt || mongoose.model<IConsentReceipt>("ConsentReceipt", ConsentReceiptSchema);
export default ConsentReceipt;
