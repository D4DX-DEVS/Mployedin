import mongoose, { Document, Schema } from "mongoose";

export interface ISalaryPeriod extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SalaryPeriodSchema = new Schema<ISalaryPeriod>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SalaryPeriodSchema.index({ isActive: 1, sortOrder: 1 });

export const SalaryPeriod =
  mongoose.models.SalaryPeriod ||
  mongoose.model<ISalaryPeriod>("SalaryPeriod", SalaryPeriodSchema);

export default SalaryPeriod;
