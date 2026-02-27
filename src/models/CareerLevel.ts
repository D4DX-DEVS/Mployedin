import mongoose, { Document, Schema } from "mongoose";

export interface ICareerLevel extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CareerLevelSchema = new Schema<ICareerLevel>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CareerLevelSchema.index({ isActive: 1, sortOrder: 1 });

export const CareerLevel =
  mongoose.models.CareerLevel ||
  mongoose.model<ICareerLevel>("CareerLevel", CareerLevelSchema);

export default CareerLevel;
