import mongoose, { Document, Schema } from "mongoose";
import { RECOMMENDATION_COOLDOWN_DAYS } from "@/lib/matching/constants";

/**
 * One row per job actually recommended to one seeker.
 *
 * Without this the pipeline had no memory. It excluded jobs the seeker had
 * already *applied* to, but nothing stopped it mailing the same job every
 * morning — and with a strict relevance floor on a job board that changes
 * slowly, the top five are the same five for weeks. A seeker would receive an
 * identical digest daily until they applied or unsubscribed.
 *
 * Rows expire on their own after RECOMMENDATION_COOLDOWN_DAYS, so a job the
 * seeker ignored may legitimately resurface later rather than being suppressed
 * for good.
 */
export interface IJobRecommendation extends Document {
  _id: mongoose.Types.ObjectId;
  /** User id of the seeker (not the JobSeeker profile id). */
  userId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  /** Relevance at the time it was sent — lets us audit drift after a weight change. */
  score: number;
  /** Which surface sent it. */
  source: "daily_digest" | "weekly_digest" | "re_engagement" | "similar_jobs";
  sentAt: Date;
  /** TTL anchor. Set on write; Mongo reaps the row when it passes. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const JobRecommendationSchema = new Schema<IJobRecommendation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    score: { type: Number, required: true },
    source: {
      type: String,
      enum: ["daily_digest", "weekly_digest", "re_engagement", "similar_jobs"],
      required: true,
    },
    sentAt: { type: Date, default: Date.now },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + RECOMMENDATION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true },
);

JobRecommendationSchema.index({ userId: 1, jobId: 1 }, { name: "seeker_job_dedup" });
JobRecommendationSchema.index({ userId: 1, sentAt: -1 });
JobRecommendationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const JobRecommendation =
  mongoose.models.JobRecommendation ||
  mongoose.model<IJobRecommendation>("JobRecommendation", JobRecommendationSchema);
export default JobRecommendation;
