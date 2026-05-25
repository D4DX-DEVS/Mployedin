import mongoose, { Document, Schema } from "mongoose";

export interface ICareerPageSection {
  type: "hero" | "about" | "benefits" | "team" | "values" | "gallery" | "testimonials" | "jobs" | "custom";
  title?: string;
  content?: string;
  imageUrl?: string;
  items?: { title: string; description: string; icon?: string }[];
  order: number;
  isVisible: boolean;
}

export interface ICareerPageTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  headerStyle: "minimal" | "full" | "centered";
  layout: "single" | "sidebar";
}

export interface ICareerPage extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  slug: string; // unique employer slug for URL
  title: string;
  metaDescription?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  theme: ICareerPageTheme;
  sections: ICareerPageSection[];
  isPublished: boolean;
  customDomain?: string;
  socialLinks?: { linkedin?: string; twitter?: string; website?: string };
  analytics: { views: number; applies: number };
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SectionSchema = new Schema<ICareerPageSection>(
  {
    type: { type: String, enum: ["hero", "about", "benefits", "team", "values", "gallery", "testimonials", "jobs", "custom"], required: true },
    title: { type: String, maxlength: 200 },
    content: { type: String, maxlength: 5000 },
    imageUrl: String,
    items: [{
      title: { type: String, maxlength: 100 },
      description: { type: String, maxlength: 500 },
      icon: String,
    }],
    order: { type: Number, required: true },
    isVisible: { type: Boolean, default: true },
  },
  { _id: true }
);

const ThemeSchema = new Schema<ICareerPageTheme>(
  {
    primaryColor: { type: String, default: "#2563eb" },
    secondaryColor: { type: String, default: "#1e40af" },
    fontFamily: { type: String, default: "Inter" },
    headerStyle: { type: String, enum: ["minimal", "full", "centered"], default: "full" },
    layout: { type: String, enum: ["single", "sidebar"], default: "single" },
  },
  { _id: false }
);

const CareerPageSchema = new Schema<ICareerPage>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true, unique: true },
    slug: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    metaDescription: { type: String, maxlength: 300 },
    logoUrl: String,
    coverImageUrl: String,
    theme: { type: ThemeSchema, default: {} },
    sections: [SectionSchema],
    isPublished: { type: Boolean, default: false },
    customDomain: { type: String, maxlength: 200 },
    socialLinks: {
      linkedin: String,
      twitter: String,
      website: String,
    },
    analytics: {
      views: { type: Number, default: 0 },
      applies: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

CareerPageSchema.index({ slug: 1 });
CareerPageSchema.index({ isPublished: 1 });

export default mongoose.models.CareerPage || mongoose.model<ICareerPage>("CareerPage", CareerPageSchema);
