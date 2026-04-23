import mongoose, { Document, Schema } from "mongoose";

// ── Text Zone Types ────────────────────────────────────────────────
export type ZoneField =
  | "title"
  | "tagline"
  | "company"
  | "location"
  | "salary"
  | "skills"
  | "cta"
  | "qr"
  | "logo"
  | "experience"
  | "workMode"
  | "watermark";

export type ZoneDisplayStyle = "plain" | "pill" | "card" | "button" | "badge";

export interface ITextZone {
  id: string;
  field: ZoneField;
  /** Percentage 0-100 from left */
  x: number;
  /** Percentage 0-100 from top */
  y: number;
  /** Percentage 0-100 width */
  w: number;
  /** Percentage 0-100 height */
  h: number;
  fontSize: number;
  fontWeight: string;
  color: string;
  align: "left" | "center" | "right";
  visible: boolean;
  /** Visual treatment style */
  displayStyle?: ZoneDisplayStyle;
  /** Background color (hex) */
  bgColor?: string;
  /** Border radius in px */
  borderRadius?: number;
  /** Inner padding in px */
  padding?: number;
}

export type PosterSizeKey = "landscape" | "square" | "story";

// ── Main Interface ─────────────────────────────────────────────────
export interface IPosterTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  category: string;
  backgroundImages: {
    landscape?: string;
    square?: string;
    story?: string;
  };
  textZones: {
    landscape: ITextZone[];
    square: ITextZone[];
    story: ITextZone[];
  };
  defaultAccentColor: string;
  isActive: boolean;
  sortOrder: number;
  previewUrl?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ─────────────────────────────────────────────────────────
const TextZoneSchema = new Schema<ITextZone>(
  {
    id: { type: String, required: true },
    field: {
      type: String,
      required: true,
      enum: [
        "title", "tagline", "company", "location", "salary",
        "skills", "cta", "qr", "logo", "experience", "workMode", "watermark",
      ],
    },
    x: { type: Number, required: true, min: 0, max: 100 },
    y: { type: Number, required: true, min: 0, max: 100 },
    w: { type: Number, required: true, min: 1, max: 100 },
    h: { type: Number, required: true, min: 1, max: 100 },
    fontSize: { type: Number, default: 16, min: 8, max: 120 },
    fontWeight: { type: String, default: "600" },
    color: { type: String, default: "#ffffff" },
    align: { type: String, enum: ["left", "center", "right"], default: "left" },
    visible: { type: Boolean, default: true },
    displayStyle: {
      type: String,
      enum: ["plain", "pill", "card", "button", "badge"],
      default: "plain",
    },
    bgColor: { type: String, default: "" },
    borderRadius: { type: Number, default: 0, min: 0, max: 50 },
    padding: { type: Number, default: 0, min: 0, max: 40 },
  },
  { _id: false },
);

const PosterTemplateSchema = new Schema<IPosterTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, required: true, trim: true, maxlength: 50, index: true },
    backgroundImages: {
      landscape: String,
      square: String,
      story: String,
    },
    textZones: {
      landscape: { type: [TextZoneSchema], default: [] },
      square: { type: [TextZoneSchema], default: [] },
      story: { type: [TextZoneSchema], default: [] },
    },
    defaultAccentColor: { type: String, default: "#6366F1" },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    previewUrl: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

PosterTemplateSchema.index({ isActive: 1, sortOrder: 1 });

export const PosterTemplate =
  mongoose.models.PosterTemplate ||
  mongoose.model<IPosterTemplate>("PosterTemplate", PosterTemplateSchema);

export default PosterTemplate;
