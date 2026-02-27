import mongoose, { Document, Schema } from "mongoose";

export interface IJobShift extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JobShiftSchema = new Schema<IJobShift>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

JobShiftSchema.index({ isActive: 1, sortOrder: 1 });

export const JobShift =
  mongoose.models.JobShift ||
  mongoose.model<IJobShift>("JobShift", JobShiftSchema);

export default JobShift;
