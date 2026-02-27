import mongoose, { Document, Schema } from "mongoose";

export interface IMaritalStatus extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MaritalStatusSchema = new Schema<IMaritalStatus>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MaritalStatusSchema.index({ isActive: 1, sortOrder: 1 });

export const MaritalStatus =
  mongoose.models.MaritalStatus ||
  mongoose.model<IMaritalStatus>("MaritalStatus", MaritalStatusSchema);

export default MaritalStatus;
