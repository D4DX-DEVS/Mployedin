import mongoose, { Document, Schema } from "mongoose";

export interface IVideo extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  url: string;
  thumbnail: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VideoSchema = new Schema<IVideo>(
  {
    title: { type: String, required: true, trim: true },
    titleAr: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    descriptionAr: { type: String, default: "", trim: true },
    url: { type: String, required: true, trim: true },
    thumbnail: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

VideoSchema.index({ isActive: 1, sortOrder: 1 });

export const Video =
  mongoose.models.Video || mongoose.model<IVideo>("Video", VideoSchema);

export default Video;
