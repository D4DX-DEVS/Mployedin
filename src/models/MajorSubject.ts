import mongoose, { Document, Schema } from "mongoose";

export interface IMajorSubject extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MajorSubjectSchema = new Schema<IMajorSubject>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MajorSubjectSchema.index({ isActive: 1, sortOrder: 1 });

export const MajorSubject =
  mongoose.models.MajorSubject ||
  mongoose.model<IMajorSubject>("MajorSubject", MajorSubjectSchema);

export default MajorSubject;
