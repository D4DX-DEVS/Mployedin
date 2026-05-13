import mongoose, { Document, Schema } from "mongoose";

/* ------------------------------------------------------------------ */
/*  Categories — enterprise exhibition resource categories             */
/* ------------------------------------------------------------------ */

export type ResourceCategory =
  | "standee_designs"
  | "brochures"
  | "flyers"
  | "employer_kits"
  | "candidate_forms"
  | "booth_designs"
  | "presentation_decks"
  | "exhibition_videos"
  | "contracts"
  | "vendor_documents"
  | "travel_templates"
  | "branding_assets"
  | "compliance_docs"
  | "other";

export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  "standee_designs", "brochures", "flyers", "employer_kits",
  "candidate_forms", "booth_designs", "presentation_decks",
  "exhibition_videos", "contracts", "vendor_documents",
  "travel_templates", "branding_assets", "compliance_docs", "other",
];

export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  standee_designs: "Standee Designs",
  brochures: "Brochures",
  flyers: "Flyers",
  employer_kits: "Employer Kits",
  candidate_forms: "Candidate Forms",
  booth_designs: "Booth Designs",
  presentation_decks: "Presentation Decks",
  exhibition_videos: "Exhibition Videos",
  contracts: "Contracts",
  vendor_documents: "Vendor Documents",
  travel_templates: "Travel Templates",
  branding_assets: "Branding Assets",
  compliance_docs: "Compliance Docs",
  other: "Other",
};

/* ------------------------------------------------------------------ */
/*  Access levels                                                      */
/* ------------------------------------------------------------------ */

export type ResourceAccessLevel = "admin" | "super_agent" | "agent" | "all_staff";

export const RESOURCE_ACCESS_LEVELS: ResourceAccessLevel[] = [
  "admin", "super_agent", "agent", "all_staff",
];

/* ------------------------------------------------------------------ */
/*  File sub-document                                                  */
/* ------------------------------------------------------------------ */

export interface IResourceFile {
  fileName: string;
  url: string;
  key: string;
  contentType: string;
  size: number;
}

/* ------------------------------------------------------------------ */
/*  Version history entry                                              */
/* ------------------------------------------------------------------ */

export interface IResourceVersion {
  version: number;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
  files: IResourceFile[];
  note?: string;
}

/* ------------------------------------------------------------------ */
/*  Main interface                                                     */
/* ------------------------------------------------------------------ */

export interface IResource extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  category: ResourceCategory;
  tags: string[];
  files: IResourceFile[];
  uploadedBy: mongoose.Types.ObjectId;
  accessLevel: ResourceAccessLevel;
  isActive: boolean;
  sortOrder: number;
  version: number;
  versionHistory: IResourceVersion[];
  downloadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Sub-schemas                                                        */
/* ------------------------------------------------------------------ */

const ResourceFileSchema = new Schema<IResourceFile>(
  {
    fileName: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    key: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const ResourceVersionSchema = new Schema<IResourceVersion>(
  {
    version: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    uploadedAt: { type: Date, default: Date.now },
    files: { type: [ResourceFileSchema], default: [] },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const ResourceSchema = new Schema<IResource>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    category: {
      type: String,
      enum: RESOURCE_CATEGORIES,
      default: "other",
      index: true,
    },
    tags: [{ type: String, trim: true, maxlength: 50 }],
    files: { type: [ResourceFileSchema], default: [] },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accessLevel: {
      type: String,
      enum: RESOURCE_ACCESS_LEVELS,
      default: "all_staff",
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
    versionHistory: { type: [ResourceVersionSchema], default: [] },
    downloadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

ResourceSchema.index({ tags: 1 });
ResourceSchema.index({ downloadCount: -1 });

export default mongoose.models.Resource ??
  mongoose.model<IResource>("Resource", ResourceSchema);
