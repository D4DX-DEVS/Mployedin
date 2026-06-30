import mongoose, { Document, Schema } from "mongoose";

/**
 * ExtractionDraft — a resumable batch of AI-extracted jobs.
 *
 * WHY: AI job extraction is metered (Gemini call + daily quota) and
 * time-consuming. Without persistence, navigating away from the
 * `/employer/jobs/ai-extract` page (Back / refresh / tab close) silently
 * destroys every extracted job, forcing the employer to re-upload the poster
 * and pay for the AI call again (see ai-extract-back-navigation-state-loss
 * repo memory). This model makes an extraction a first-class resumable
 * resource: the employer can post some jobs today, leave, and return tomorrow
 * to post the rest.
 *
 * LIFECYCLE:
 *   active  ──(all jobs posted/discard)──▶  completed
 *   active  ──(expiresAt passed)──────────▶  expired   (driven by cron in
 *                                                     extractionDraftExpiry.ts)
 *
 * Individual job entries carry their own `status` so we can render accurate
 * "12 posted / 38 remaining" counters on the dashboard resume card without a
 * separate aggregation query.
 */

export type DraftedJobStatus = "pending" | "posted" | "skipped";

export interface DraftedJob {
  /** Stable client-side index (position in the original extraction array). */
  index: number;
  /** Status of THIS job entry; mirrors postingStatuses on the client. */
  status: DraftedJobStatus;
  /** Populated once the job has been POSTed via /api/jobs. */
  postedJobId?: mongoose.Types.ObjectId;
  /** The full extracted job payload, verbatim from the AI extraction step. */
  data: ExtractedJobPayload;
}

export interface ExtractedJobPayload {
  title: string;
  category?: string;
  description?: string;
  location?: { country?: string; city?: string; isRemote?: boolean };
  requirements?: {
    skills?: string[];
    preferredSkills?: string[];
    experienceMin?: number;
    experienceMax?: number;
  };
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
    period?: string;
    isNegotiable?: boolean;
  };
  employmentType?: string;
  workMode?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  vacancies?: number;
  tags?: string[];
  contactInfo?: string;
}

export type ExtractionDraftStatus = "active" | "completed" | "expired";

export interface IExtractionDraft extends Document {
  employerId: mongoose.Types.ObjectId;
  companyName?: string;
  /** Original uploaded file name — File objects are NON-serializable so we
   *  keep only metadata for the resume UI ("Hiring Poster.pdf"). */
  fileName: string;
  /** MIME type of the source poster (PDF/JPEG/PNG/WebP/DOCX). */
  sourceMimeType?: string;
  /** Detected source language returned by the extractor, if any. */
  sourceLanguage?: string;
  jobs: DraftedJob[];
  /** Indices still selected for posting on resume (mirrors client Set). */
  selectedIndices: number[];
  status: ExtractionDraftStatus;
  /** Hard expiry cut-off; cron deletes drafts past this point. */
  expiresAt: Date;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DraftedJobSchema = new Schema<DraftedJob>({
  index: { type: Number, required: true },
  status: { type: String, enum: ["pending", "posted", "skipped"], default: "pending" },
  postedJobId: { type: Schema.Types.ObjectId, ref: "Job" },
  data: { type: Schema.Types.Mixed, required: true },
}, { _id: false });

const ExtractionDraftSchema = new Schema<IExtractionDraft>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true, index: true },
    companyName: { type: String, trim: true },
    fileName: { type: String, required: true, trim: true },
    sourceMimeType: { type: String, trim: true },
    sourceLanguage: { type: String, trim: true },
    jobs: { type: [DraftedJobSchema], default: [] },
    selectedIndices: { type: [Number], default: [] },
    status: { type: String, enum: ["active", "completed", "expired"], default: "active" },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * Compound index backing the dashboard "resume" lookup: give me the most
 * recent active draft for this employer, fast. (Jobs list + employer page
 * both hit this pattern.)
 */
ExtractionDraftSchema.index({ employerId: 1, status: 1, createdAt: -1 });

export const ExtractionDraft =
  mongoose.models.ExtractionDraft ||
  mongoose.model<IExtractionDraft>("ExtractionDraft", ExtractionDraftSchema);

export default ExtractionDraft;
