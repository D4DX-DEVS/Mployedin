/**
 * JobAttribute — consolidated lookup model replacing the individual
 * JobType, CareerLevel, Industry, FunctionalArea, JobShift, SkillLevel,
 * LanguageLevel, DegreeLevel, DegreeType, MajorSubject, SalaryPeriod,
 * OwnershipType, ResultType, Gender, MaritalStatus collections.
 *
 * Each document has a `category` field that replaces the old collection name.
 * This reduces 15 tiny lookup collections to one, eliminating excessive
 * `$lookup` joins and simplifying seed/admin CRUD.
 *
 * Migration: run `scripts/migrate-job-attributes.ts` to back-fill existing
 * data from the old collections into this one.
 */

import mongoose, { Document, Schema } from "mongoose";

export type JobAttributeCategory =
  | "job_type"          // Full-time, Part-time, Contract, Freelance …
  | "career_level"      // Junior, Mid, Senior, Lead, C-Level …
  | "industry"          // Technology, Healthcare, Finance …
  | "functional_area"   // Engineering, Sales, Marketing …
  | "job_shift"         // Morning, Evening, Night, Flexible …
  | "skill_level"       // Beginner, Intermediate, Advanced, Expert
  | "language_level"    // Basic, Conversational, Professional, Native
  | "degree_level"      // Bachelor, Master, PhD …
  | "degree_type"       // Science, Arts, Commerce …
  | "major_subject"     // Computer Science, Business Administration …
  | "salary_period"     // Monthly, Annual, Hourly …
  | "ownership_type"    // Private, Government, MNC …
  | "result_type"       // Pass/Fail, Grade, Percentage …
  | "gender"            // Male, Female, Non-binary, Prefer not to say
  | "marital_status";   // Single, Married, Divorced …

export interface IJobAttribute extends Document {
  _id: mongoose.Types.ObjectId;
  category: JobAttributeCategory;
  /** Display label (English) */
  label: string;
  /** Display label (Arabic) */
  labelAr?: string;
  /** URL-safe slug, unique within category */
  slug: string;
  /** Sort order for UI dropdowns */
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JobAttributeSchema = new Schema<IJobAttribute>(
  {
    category: {
      type: String,
      required: true,
      enum: [
        "job_type", "career_level", "industry", "functional_area",
        "job_shift", "skill_level", "language_level", "degree_level",
        "degree_type", "major_subject", "salary_period", "ownership_type",
        "result_type", "gender", "marital_status",
      ],
      index: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    labelAr: { type: String, trim: true, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Unique slug per category
JobAttributeSchema.index({ category: 1, slug: 1 }, { unique: true });
// Fast category + active listing (used by all dropdowns)
JobAttributeSchema.index({ category: 1, isActive: 1, order: 1 });

const JobAttribute =
  (mongoose.models.JobAttribute as mongoose.Model<IJobAttribute>) ||
  mongoose.model<IJobAttribute>("JobAttribute", JobAttributeSchema);

export default JobAttribute;
