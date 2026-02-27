import mongoose, { Document, Schema } from "mongoose";

export interface IStaticPage extends Document {
  _id: mongoose.Types.ObjectId;
  slug: string;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StaticPageSchema = new Schema<IStaticPage>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    titleAr: { type: String, default: "", trim: true },
    body: { type: String, required: true },
    bodyAr: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

StaticPageSchema.index({ slug: 1 }, { unique: true });
StaticPageSchema.index({ isActive: 1 });

export const StaticPage =
  mongoose.models.StaticPage ||
  mongoose.model<IStaticPage>("StaticPage", StaticPageSchema);

export default StaticPage;
