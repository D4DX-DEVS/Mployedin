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

/** A poster drawn in code from a brand kit (lib/brand, components/features/poster/BrandPoster). */
export interface IBrandPosterSpec {
  /** Whose brand: the employer's own kit or the Mployedin kit. */
  source: "company" | "mployedin";
  layout: "spotlight" | "band" | "split" | "frame" | "night" | "minimal";
  look: "bold" | "clean" | "urgent";
  headline: string;
  locale: "en" | "ar";
  /** The kit as it was when the poster was made, so later kit edits don't repaint old posters. */
  kit: {
    logoUrl?: string;
    displayName?: string;
    primary: string;
    accent: string;
    text: string;
    background: string;
    font: string;
    tone: string;
  };
}

export interface IPosterGeneration extends Document {
  _id: mongoose.Types.ObjectId;
  /** "ai" = AI background + overlay (original maker); "brand" = drawn in code from a brand kit. */
  kind: "ai" | "brand";
  brand?: IBrandPosterSpec;
  /** Who made it from outside the employer workspace (an admin through the MCP connector). */
  createdByUserId?: mongoose.Types.ObjectId;
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
  /** Post-generation editor state (per-element overrides + chosen template). */
  styleOverrides?: Record<string, unknown>;
  layoutOverride?: PosterLayout;
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

const BrandPosterSpecSchema = new Schema<IBrandPosterSpec>(
  {
    source: { type: String, enum: ["company", "mployedin"], required: true },
    layout: { type: String, enum: ["spotlight", "band", "split", "frame", "night", "minimal"], required: true },
    look: { type: String, enum: ["bold", "clean", "urgent"], required: true },
    headline: { type: String, required: true, maxlength: 80 },
    locale: { type: String, enum: ["en", "ar"], default: "en" },
    kit: {
      logoUrl: { type: String, maxlength: 2048 },
      displayName: { type: String, maxlength: 60 },
      primary: { type: String, required: true, maxlength: 7 },
      accent: { type: String, required: true, maxlength: 7 },
      text: { type: String, required: true, maxlength: 7 },
      background: { type: String, required: true, maxlength: 7 },
      font: { type: String, required: true, maxlength: 20 },
      tone: { type: String, required: true, maxlength: 20 },
    },
  },
  { _id: false },
);

const PosterGenerationSchema = new Schema<IPosterGeneration>(
  {
    kind: { type: String, enum: ["ai", "brand"], default: "ai" },
    brand: { type: BrandPosterSpecSchema, default: undefined },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
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
    styleOverrides: { type: Schema.Types.Mixed, default: undefined },
    layoutOverride: { type: String, enum: ["layout-a", "layout-b", "layout-c", "layout-d"], default: undefined },
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
PosterGenerationSchema.index({ jobId: 1, createdAt: -1 });

export default mongoose.models.PosterGeneration ??
  mongoose.model<IPosterGeneration>("PosterGeneration", PosterGenerationSchema);
