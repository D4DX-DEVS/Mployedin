import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A passwordless sign-in code that has been emailed but not yet redeemed.
 *
 * Why a separate collection instead of writing onto User:
 *  - Requesting a code must NOT create an account. Before this existed, every
 *    email typed into the quick-apply card minted a permanent User + JobSeeker,
 *    which made the endpoint a junk-account generator and let anyone shorten a
 *    stranger's pending 24-hour signup verification (both flows shared one
 *    expiry field on User). The account is created only when a code is redeemed.
 *  - Rows expire on their own via the TTL index, so abandoned attempts leave
 *    nothing behind.
 *
 * One row per email (unique). Re-requesting a code replaces the row.
 */
export interface IPendingSignin extends Document {
  email: string;
  /** hashOtp(code, "signin") — never the plaintext code. */
  otpHash: string;
  /** Wrong-code submissions against this row; the row is discarded at the cap. */
  attempts: number;
  /** Requesting IP, for abuse investigation only. */
  requestIp?: string;
  /** Full name for the account (from quick-apply). */
  name?: string;
  expiresAt: Date;
  createdAt: Date;
}

export const PENDING_SIGNIN_TTL_MS = 10 * 60 * 1000;
export const PENDING_SIGNIN_MAX_ATTEMPTS = 5;

const PendingSigninSchema = new Schema<IPendingSignin>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    requestIp: { type: String },
    name: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// MongoDB TTL index — rows vanish once expiresAt passes.
PendingSigninSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PendingSignin: Model<IPendingSignin> =
  mongoose.models.PendingSignin ?? mongoose.model<IPendingSignin>("PendingSignin", PendingSigninSchema);

export default PendingSignin;
