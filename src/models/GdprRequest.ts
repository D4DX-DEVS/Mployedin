import mongoose, { Document, Schema } from "mongoose";
import { ADMIN_NOTES_MAX, OUTCOME_MAX, OUTCOME_REASON_MAX } from "@/lib/gdpr/requestOutcome";

/**
 * GDPR data-subject request register.
 *
 * Self-service export / erasure (`/api/gdpr/export`) records a completed entry
 * automatically; requests that need manual handling (rectification,
 * restriction) move through pending → in_progress → completed | rejected on
 * the admin GDPR page. Audit logs are immutable, which is why this lives in
 * its own collection instead of being derived from them.
 *
 * Two kinds of free text, never mixed: `notes` is the USER's own words (the
 * reason they gave for deleting their account) and is never written by an
 * admin; `outcome`, `outcomeReason` and `adminNotes` are what the TEAM
 * recorded. The user may be shown `outcome` and `outcomeReason` (a refused
 * person is told why); `adminNotes` is internal and is never sent to them.
 */
/**
 * `complaint` is a privacy complaint made to us (DUAA 2025: controllers must
 * take complaints and acknowledge them within 30 days). The person's words are
 * in `notes`; the team answers through `outcome` like any other request.
 */
export type GdprRequestType = "export" | "delete" | "rectification" | "restrict" | "complaint";
export type GdprRequestStatus = "pending" | "in_progress" | "completed" | "rejected" | "cancelled";

export const GDPR_REQUEST_TYPES: GdprRequestType[] = ["export", "delete", "rectification", "restrict", "complaint"];
export const GDPR_REQUEST_STATUSES: GdprRequestStatus[] = ["pending", "in_progress", "completed", "rejected", "cancelled"];

/** Allowed status transitions; completed, rejected and cancelled are terminal. */
export const GDPR_REQUEST_TRANSITIONS: Record<GdprRequestStatus, GdprRequestStatus[]> = {
  pending: ["in_progress", "completed", "rejected", "cancelled"],
  in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
  cancelled: [],
};

export interface IGdprRequest extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  /** Snapshot at request time — the user may be anonymised later. */
  userName: string;
  userEmail: string;
  requestType: GdprRequestType;
  status: GdprRequestStatus;
  /** The user's own words (a deletion reason, a complaint). Written once, at request time; never by an admin. */
  notes?: string;
  /** What the team did. */
  outcome?: string;
  /** Why the request was refused, or what was not done and why. Shown to the user. */
  outcomeReason?: string;
  /** Internal only; never sent to the user. */
  adminNotes?: string;
  /**
   * When the request was DECIDED: set when it is completed and when it is refused (rejected), so the register
   * shows the date of every answer (UK GDPR Art 12(3)/(4)) and the average response time counts refusals.
   * Reused instead of a separate decidedAt field (the smaller change); `updatedAt` can't stand in for it,
   * because an erasure's anonymisation of the person's other requests moves theirs.
   */
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
    outcome: { type: String, trim: true, maxlength: OUTCOME_MAX },
    outcomeReason: { type: String, trim: true, maxlength: OUTCOME_REASON_MAX },
    adminNotes: { type: String, trim: true, maxlength: ADMIN_NOTES_MAX },
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
