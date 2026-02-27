import mongoose, { Document, Schema } from "mongoose";

export interface IGender extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GenderSchema = new Schema<IGender>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

GenderSchema.index({ isActive: 1, sortOrder: 1 });

export const Gender =
  mongoose.models.Gender ||
  mongoose.model<IGender>("Gender", GenderSchema);

export default Gender;
