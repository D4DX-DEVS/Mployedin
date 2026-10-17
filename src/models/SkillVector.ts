import mongoose, { Document, Schema } from "mongoose";

/**
 * Cached embedding for one canonical skill string.
 *
 * Skill matching used to be an exact string compare, which scored a QA engineer
 * listing "Manual Testing, Selenium, Cypress" at zero against a job asking for
 * "API Testing, Test Automation Frameworks, Postman". Measured on the live
 * corpus, 113 of 219 seekers shared no skill token with any job on the board.
 *
 * Embedding every distinct skill once and comparing vectors closes that gap
 * without an AI call per candidate. There were 835 distinct skills across the
 * whole platform when this was built (139 job-side, 696 seeker-side), so the
 * cache is small, permanent and cheap to fill.
 *
 * Vectors come from `gemini-embedding-001` — the same model the Atlas
 * jobseeker index uses — kept at their first 768 dimensions, renormalized, as
 * float32 little-endian bytes (see `lib/matching/skillSimilarity.ts`). Rows
 * written before 2026-10-16 still hold the full 3,072 numbers as an array;
 * `lib/matching/skillVectors.ts` reads both and the migration script rewrites
 * them. `dims` is stored so a future model change is detectable rather than
 * silently producing nonsense cosines.
 */
export interface ISkillVector extends Document {
  _id: mongoose.Types.ObjectId;
  /** Output of normalizeSkill() — the lookup key. */
  canonical: string;
  /** One of the raw spellings seen for this skill, kept for debugging. */
  sample?: string;
  /** float32 LE bytes (768 dims). Legacy rows still hold a number[] of 3,072; readers use lean() and decode both. */
  vector: Buffer;
  dims: number;
  /** Named `embeddingModel`, not `model`: Document already has a `model` member. */
  embeddingModel: string;
  createdAt: Date;
  updatedAt: Date;
}

const SkillVectorSchema = new Schema<ISkillVector>(
  {
    canonical: { type: String, required: true, unique: true, index: true },
    sample: { type: String },
    // Mixed, not Buffer: the collection holds Buffers (new) and arrays (legacy)
    // until the rewrite runs, every read is lean(), and the bulkWrite that
    // stores a Buffer must not be cast. Mongoose 9's typed schema also rejects
    // Schema.Types.Buffer against Node 22's generic Buffer.
    vector: { type: Schema.Types.Mixed, required: true },
    dims: { type: Number, required: true },
    embeddingModel: { type: String, required: true },
  },
  { timestamps: true },
);

export const SkillVector =
  mongoose.models.SkillVector ||
  mongoose.model<ISkillVector>("SkillVector", SkillVectorSchema);
export default SkillVector;
