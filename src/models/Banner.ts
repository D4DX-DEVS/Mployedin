import mongoose, { Document, Schema } from "mongoose";
import type { UserRole } from "@/models/User";

export type BannerPlacement = "landing-carousel" | "in-app-announcement";
export type BannerStyle = "info" | "success" | "warning";
export type BannerAudienceRole = "all" | UserRole;

export interface IBanner extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  image: string;
  linkUrl: string;
  linkText: string;
  linkTextAr: string;
  sortOrder: number;
  isActive: boolean;
  placement: BannerPlacement[];
  audienceRoles: BannerAudienceRole[];
  startDate?: Date;
  endDate?: Date;
  style: BannerStyle;
  dismissible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema = new Schema<IBanner>(
  {
    title: { type: String, default: "", trim: true },
    titleAr: { type: String, default: "", trim: true },
    subtitle: { type: String, default: "", trim: true },
    subtitleAr: { type: String, default: "", trim: true },
    // Landing carousel banners need one (validator); in-app announcements are text.
    image: { type: String, default: "" },
    linkUrl: { type: String, default: "", trim: true },
    linkText: { type: String, default: "", trim: true },
    linkTextAr: { type: String, default: "", trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    placement: { type: [String], default: ["landing-carousel"], enum: ["landing-carousel", "in-app-announcement"] },
    audienceRoles: { type: [String], default: ["all"], enum: ["all", "admin", "super_agent", "agent", "employer", "job_seeker"] },
    startDate: { type: Date, default: undefined },
    endDate: { type: Date, default: undefined },
    style: { type: String, default: "info", enum: ["info", "success", "warning"] },
    dismissible: { type: Boolean, default: false },
  },
  { timestamps: true }
);

BannerSchema.index({ isActive: 1, sortOrder: 1 });
BannerSchema.index({ placement: 1, audienceRoles: 1, isActive: 1 });

export const Banner =
  mongoose.models.Banner || mongoose.model<IBanner>("Banner", BannerSchema);

export default Banner;
