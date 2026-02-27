import mongoose, { Document, Schema } from "mongoose";

export interface IResultType extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ResultTypeSchema = new Schema<IResultType>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ResultTypeSchema.index({ isActive: 1, sortOrder: 1 });

export const ResultType =
  mongoose.models.ResultType ||
  mongoose.model<IResultType>("ResultType", ResultTypeSchema);

export default ResultType;
