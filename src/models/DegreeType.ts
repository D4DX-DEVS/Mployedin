import mongoose, { Document, Schema } from "mongoose";

export interface IDegreeType extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DegreeTypeSchema = new Schema<IDegreeType>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DegreeTypeSchema.index({ isActive: 1, sortOrder: 1 });

export const DegreeType =
  mongoose.models.DegreeType ||
  mongoose.model<IDegreeType>("DegreeType", DegreeTypeSchema);

export default DegreeType;
