import mongoose, { Document, Schema } from "mongoose";

/**
 * One admin-managed job category (Admin → Master Data → Job categories).
 * Same shape as the other job-attribute tables so the generic admin CRUD
 * (`/api/admin/job-attributes/[category]`) serves it unchanged.
 */
export interface IJobCategory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JobCategorySchema = new Schema<IJobCategory>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

JobCategorySchema.index({ isActive: 1, sortOrder: 1 });

export const JobCategory =
  (mongoose.models.JobCategory as mongoose.Model<IJobCategory>) ||
  mongoose.model<IJobCategory>("JobCategory", JobCategorySchema);

export default JobCategory;
