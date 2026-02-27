import mongoose, { Document, Schema } from "mongoose";

export interface IBanner extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  image: string;
  imageMobile: string;
  linkUrl: string;
  linkText: string;
  linkTextAr: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema = new Schema<IBanner>(
  {
    title: { type: String, default: "", trim: true },
    titleAr: { type: String, default: "", trim: true },
    subtitle: { type: String, default: "", trim: true },
    subtitleAr: { type: String, default: "", trim: true },
    image: { type: String, required: true },
    imageMobile: { type: String, default: "" },
    linkUrl: { type: String, default: "", trim: true },
    linkText: { type: String, default: "", trim: true },
    linkTextAr: { type: String, default: "", trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

BannerSchema.index({ isActive: 1, sortOrder: 1 });

export const Banner =
  mongoose.models.Banner || mongoose.model<IBanner>("Banner", BannerSchema);

export default Banner;
