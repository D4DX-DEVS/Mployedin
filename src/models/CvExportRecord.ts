import mongoose, { Document, Schema } from "mongoose";

export const CV_EXPORT_VERSIONS = ["standardised", "original"] as const;
export type CvExportVersion = (typeof CV_EXPORT_VERSIONS)[number];

/**
 * One candidate in one bulk CV export, optionally for a job.
 *
 * The manifest writes a `pending` row for every candidate it lets the person
 * export (the server has just checked access there). The browser builds the
 * ZIP, then confirms the candidates whose files really landed in it, which
 * turns those rows `done` with the versions included. Only `done` rows count
 * as "CV sent": a cancelled or failed export never says the client has a CV.
 * Pending rows nobody confirmed expire after a day (TTL below).
 *
 * The `cv.export` AuditLog entry stays the audit trail; this is the
 * per-candidate history the Job Seekers list and profile read.
 */
export interface ICvExportRecord extends Document {
  _id: mongoose.Types.ObjectId;
  /** Every row from one manifest call shares it; the confirm call names it. */
  batchId: mongoose.Types.ObjectId;
  seekerId: mongoose.Types.ObjectId;
  /** The job the CVs were exported for, when the person chose one (admin only for now). */
  jobId?: mongoose.Types.ObjectId;
  applicationId?: mongoose.Types.ObjectId;
  /** The human who exported (the real actor during tenant view). */
  actorId: mongoose.Types.ObjectId;
  actorRole: string;
  status: "pending" | "done";
  versions: CvExportVersion[];
  completedAt?: Date;
  createdAt: Date;
}

const CvExportRecordSchema = new Schema<ICvExportRecord>(
  {
    batchId: { type: Schema.Types.ObjectId, required: true },
    seekerId: { type: Schema.Types.ObjectId, ref: "JobSeeker", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
    applicationId: { type: Schema.Types.ObjectId, ref: "Application" },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, required: true },
    status: { type: String, enum: ["pending", "done"], default: "pending" },
    versions: { type: [String], enum: CV_EXPORT_VERSIONS, default: [] },
    completedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// A seeker's export history, newest first (profile timeline, list rows).
CvExportRecordSchema.index({ seekerId: 1, status: 1, createdAt: -1 });
// Who already has a CV for this job (list filter, export warning, job bar count).
CvExportRecordSchema.index({ jobId: 1, status: 1, seekerId: 1 });
// The confirm call finds its batch.
CvExportRecordSchema.index({ batchId: 1, actorId: 1 });
// Unconfirmed rows (cancelled or failed exports) go after a day.
CvExportRecordSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 24 * 60 * 60, partialFilterExpression: { status: "pending" }, name: "pending_ttl" },
);

export const CvExportRecord =
  (mongoose.models.CvExportRecord as mongoose.Model<ICvExportRecord> | undefined) ??
  mongoose.model<ICvExportRecord>("CvExportRecord", CvExportRecordSchema);
export default CvExportRecord;
