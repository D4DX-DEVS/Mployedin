import mongoose, { Document, Schema } from "mongoose";
import type { ParsedCv } from "@/lib/cv/parsedCv";

/**
 * One CV file a job seeker uploaded, and what reading it produced.
 *
 * Keyed by the stored file (jobSeekerId + fileUrl). An application keeps the
 * URL of the CV it was sent with, so it finds its own CV here even after the
 * seeker uploads a new one: an application from January is scored on the CV
 * sent in January. The file behind a URL that any application still uses is
 * never deleted (lib/cv/cvDocuments.ts).
 *
 * Reading happens off the request path (lib/cv/processCv.ts): the text layer is
 * extracted, the AI parser turns it into skills / jobs / education, and the
 * applications that use the file are re-scored.
 */

export type CvStatus = "uploaded" | "processing" | "processed" | "failed";

/** Where the file came from: the profile CV, a resume in the document library, or an application attachment. */
export type CvSource = "profile" | "document" | "application";

/** text_layer: the PDF/DOCX text; ai_vision: a scan the AI read; reused: copied from an identical file. */
export type CvTextSource = "text_layer" | "ai_vision" | "reused";

export interface ICvDocument extends Document {
  _id: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  fileUrl: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  source: CvSource;
  /** sha256 of the file bytes — an identical re-upload reuses the reading. */
  fingerprint?: string;
  status: CvStatus;
  /** The CV text, capped at 20k characters. */
  text?: string;
  textSource?: CvTextSource;
  /** What the AI parser read; null when only the text could be kept. */
  parsed?: ParsedCv | null;
  parserVersion?: number;
  attempts: number;
  processedAt?: Date;
  /** Why the last attempt failed: file_missing, unreadable, unsupported_type, parse_failed, error. */
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CvDocumentSchema = new Schema<ICvDocument>(
  {
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "JobSeeker", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    fileUrl: { type: String, required: true },
    fileName: String,
    mimeType: String,
    size: Number,
    source: { type: String, enum: ["profile", "document", "application"], required: true },
    fingerprint: String,
    status: {
      type: String,
      enum: ["uploaded", "processing", "processed", "failed"],
      default: "uploaded",
      required: true,
    },
    text: String,
    textSource: { type: String, enum: ["text_layer", "ai_vision", "reused"] },
    parsed: { type: Schema.Types.Mixed, default: null },
    parserVersion: Number,
    attempts: { type: Number, default: 0 },
    processedAt: Date,
    error: String,
  },
  { timestamps: true },
);

CvDocumentSchema.index({ jobSeekerId: 1, fileUrl: 1 }, { unique: true });
// An identical file already read for this seeker.
CvDocumentSchema.index({ jobSeekerId: 1, fingerprint: 1 });
// The backfill's queue: what still needs reading.
CvDocumentSchema.index({ status: 1, updatedAt: 1 });

export const CvDocument =
  mongoose.models.CvDocument || mongoose.model<ICvDocument>("CvDocument", CvDocumentSchema);

export default CvDocument;
