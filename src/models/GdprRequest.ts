import mongoose, { Document, Schema } from "mongoose";

/**
 * GDPR data-subject request register.
 *
 * Self-service export / erasure (`/api/gdpr/export`) records a completed entry
 * automatically; requests that need manual handling (rectification,
 * restriction) move through pending → in_progress → completed | rejected on
 * the admin GDPR page. Audit logs are immutable, which is why this lives in
 * its own collection instead of being derived from them.
 */
export type GdprRequestType = "export" | "delete" | "rectification" | "restrict";
export type GdprRequestStatus = "pending" | "in_progress" | "completed" | "rejected";

export const GDPR_REQUEST_TYPES: GdprRequestType[] = ["export", "delete", "rectification", "restrict"];
export const GDPR_REQUEST_STATUSES: GdprRequestStatus[] = ["pending", "in_progress", "completed", "rejected"];

/** Allowed status transitions; completed and rejected are terminal. */
export const GDPR_REQUEST_TRANSITIONS: Record<GdprRequestStatus, GdprRequestStatus[]> = {
  pending: ["in_progress", "completed", "rejected"],
  in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
};

export interface IGdprRequest extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  /** Snapshot at request time — the user may be anonymised later. */
  userName: string;
  userEmail: string;
  requestType: GdprRequestType;
  status: GdprRequestStatus;
  notes?: string;
  completedAt?: Date;
  handledBy?: mongoose.Types.ObjectId;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GdprRequestSchema = new Schema<IGdprRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true, trim: true, maxlength: 200 },
    userEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
    requestType: { type: String, enum: GDPR_REQUEST_TYPES, required: true },
    status: { type: String, enum: GDPR_REQUEST_STATUSES, default: "pending" },
    notes: { type: String, maxlength: 2000 },
    completedAt: Date,
    handledBy: { type: Schema.Types.ObjectId, ref: "User" },
    ipAddress: String,
  },
  { timestamps: true },
);

GdprRequestSchema.index({ createdAt: -1 });
GdprRequestSchema.index({ status: 1 });
GdprRequestSchema.index({ userId: 1 });

export const GdprRequest =
  mongoose.models.GdprRequest || mongoose.model<IGdprRequest>("GdprRequest", GdprRequestSchema);
export default GdprRequest;
