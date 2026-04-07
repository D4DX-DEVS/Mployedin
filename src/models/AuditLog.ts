import mongoose, { Document, Schema } from "mongoose";

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId;
  actorRole: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  ipAddress?: string;
  country?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorRole: { type: String, default: "system" },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: String,
    changes: {
      before: Schema.Types.Mixed,
      after: Schema.Types.Mixed,
    },
    ipAddress: String,
    country: String,
    userAgent: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ actorId: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ country: 1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
export default AuditLog;
