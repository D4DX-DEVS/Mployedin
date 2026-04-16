import mongoose, { Schema, Document, Model } from "mongoose";

export interface IImpersonationSession extends Document {
  adminId: mongoose.Types.ObjectId;   // the real admin user
  targetId: mongoose.Types.ObjectId;  // the user being impersonated
  targetEmail: string;
  targetRole: string;
  createdAt: Date;
  expiresAt: Date;
}

const ImpersonationSessionSchema = new Schema<IImpersonationSession>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetEmail: { type: String, required: true },
    targetRole: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// MongoDB TTL index — MongoDB automatically deletes documents after expiresAt
ImpersonationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ImpersonationSession: Model<IImpersonationSession> =
  mongoose.models.ImpersonationSession ??
  mongoose.model<IImpersonationSession>("ImpersonationSession", ImpersonationSessionSchema);

export default ImpersonationSession;
