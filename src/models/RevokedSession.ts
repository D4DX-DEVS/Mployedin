import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A signed-out session. Sessions are stateless JWTs, so without this a cookie
 * copied before sign-out kept working until the token expired (up to 3 days).
 * The jwt callback refuses any token whose `sid` is listed here.
 *
 * Rows expire with the token they revoke (TTL index), so the collection only
 * ever holds sessions that could still be replayed.
 */
export interface IRevokedSession extends Document {
  /** The `sid` claim of the revoked JWT. */
  sid: string;
  userId?: string;
  /** The revoked token's own expiry — after this it can't be replayed anyway. */
  expiresAt: Date;
  createdAt: Date;
}

const RevokedSessionSchema = new Schema<IRevokedSession>(
  {
    sid: { type: String, required: true, unique: true },
    userId: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

RevokedSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RevokedSession: Model<IRevokedSession> =
  mongoose.models.RevokedSession ?? mongoose.model<IRevokedSession>("RevokedSession", RevokedSessionSchema);

export default RevokedSession;
