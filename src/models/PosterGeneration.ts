import mongoose, { type Document, Schema } from "mongoose";
import type { PosterType, PosterFormat, DesignStyle, PosterLayout, ShowFields } from "@/lib/composer/types";

export interface IPosterVariation {
  backgroundUrl: string;
  layout: PosterLayout;
}

export interface IPosterAnalytics {
  views: number;
  downloads: number;
  qrScans: number;
}

export interface IPosterGeneration extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  type: PosterType;
  prompt: string;
  style: DesignStyle;
  showFields: ShowFields;
  formats: PosterFormat[];
  variations: IPosterVariation[];
  selectedVariation: number;
  finalPosterUrls: Record<string, string>;
  shareSlug: string;
  analytics: IPosterAnalytics;
  creditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const PosterVariationSchema = new Schema<IPosterVariation>(
  {
    backgroundUrl: { type: String, required: true },
    layout: { type: String, required: true, enum: ["layout-a", "layout-b", "layout-c", "layout-d"] },
  },
  { _id: false },
);

const PosterGenerationSchema = new Schema<IPosterGeneration>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ["single-job", "bulk-hiring", "urgent-hiring", "walk-in-interview"],
    },
    prompt: { type: String, required: true, maxlength: 500 },
    style: {
      type: String,
      required: true,
      enum: ["professional", "modern", "creative", "minimal", "bold", "luxury"],
    },
    showFields: {
      salary: { type: Boolean, default: true },
      location: { type: Boolean, default: true },
      experience: { type: Boolean, default: true },
      skills: { type: Boolean, default: true },
    },
    formats: [{ type: String, enum: ["instagram-post", "instagram-story", "linkedin-post", "a4-print"] }],
    variations: [PosterVariationSchema],
    selectedVariation: { type: Number, default: 0 },
    finalPosterUrls: { type: Schema.Types.Mixed, default: {} },
    shareSlug: { type: String, unique: true, sparse: true },
    analytics: {
      views: { type: Number, default: 0 },
      downloads: { type: Number, default: 0 },
      qrScans: { type: Number, default: 0 },
    },
    creditsUsed: { type: Number, default: 2 },
  },
  { timestamps: true },
);

PosterGenerationSchema.index({ employerId: 1, createdAt: -1 });
PosterGenerationSchema.index({ shareSlug: 1 });

export default mongoose.models.PosterGeneration ??
  mongoose.model<IPosterGeneration>("PosterGeneration", PosterGenerationSchema);
