import mongoose, { Document, Schema } from "mongoose";

export interface IJobSkill extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JobSkillSchema = new Schema<IJobSkill>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

JobSkillSchema.index({ isActive: 1, sortOrder: 1 });
JobSkillSchema.index({ name: "text", nameAr: "text" });

export const JobSkill =
  mongoose.models.JobSkill ||
  mongoose.model<IJobSkill>("JobSkill", JobSkillSchema);

export default JobSkill;
