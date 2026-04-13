/**
 * AICache — stores AI response results keyed by a SHA-256 hash of the
 * (task + prompt) input so identical requests hit the cache instead of
 * burning tokens on the AI provider.
 *
 * TTL strategy (via MongoDB TTL index on `expiresAt`):
 *   - job_match / skills_gap   → 24 hours  (job postings change daily)
 *   - cv_extract               → 7 days    (CVs rarely change)
 *   - report                   → 1 hour    (reports are more bespoke)
 *   - everything else          → 6 hours
 */

import mongoose, { Document, Schema } from "mongoose";
import type { AITask } from "@/lib/ai/router";

export const CACHE_TTL_SEC: Record<AITask, number> = {
  job_match: 24 * 60 * 60,
  skills_gap: 24 * 60 * 60,
  cv_extract: 7 * 24 * 60 * 60,
  report: 60 * 60,
  chat: 6 * 60 * 60,
  job_description: 6 * 60 * 60,
  nl_search: 6 * 60 * 60,
};

export interface IAICache extends Document {
  hash: string;          // SHA-256(task + ":" + prompt)
  task: AITask;
  result: string;        // Raw AI text output
  expiresAt: Date;       // MongoDB TTL index deletes the doc after this
  createdAt: Date;
}

const AICacheSchema = new Schema<IAICache>(
  {
    hash: { type: String, required: true, unique: true, index: true },
    task: { type: String, required: true },
    result: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// MongoDB deletes documents automatically when expiresAt is reached
AICacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AICache = (mongoose.models.AICache as mongoose.Model<IAICache>) ||
  mongoose.model<IAICache>("AICache", AICacheSchema);

export default AICache;
