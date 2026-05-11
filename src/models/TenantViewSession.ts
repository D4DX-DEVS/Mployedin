import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITenantViewSession extends Document {
  /** The admin / agent / super_agent who initiated the switch */
  actorId: mongoose.Types.ObjectId;
  actorRole: string;
  /** The employer being viewed */
  employerId: mongoose.Types.ObjectId;
  /** The employer's own User._id — used to proxy API calls */
  employerUserId: mongoose.Types.ObjectId;
  companyName: string;
  createdAt: Date;
  expiresAt: Date;
}

const TenantViewSessionSchema = new Schema<ITenantViewSession>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, required: true },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    employerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    companyName: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One active session per actor at a time
TenantViewSessionSchema.index({ actorId: 1 }, { unique: true });
// TTL — MongoDB auto-deletes expired sessions
TenantViewSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TenantViewSession: Model<ITenantViewSession> =
  mongoose.models.TenantViewSession ??
  mongoose.model<ITenantViewSession>("TenantViewSession", TenantViewSessionSchema);

export default TenantViewSession;
