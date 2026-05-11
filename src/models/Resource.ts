import mongoose, { Document, Schema } from "mongoose";

export type ResourceCategory =
  | "brochure"
  | "banner"
  | "presentation"
  | "document"
  | "image"
  | "video"
  | "template"
  | "other";

export interface IResourceFile {
  /** Original file name */
  fileName: string;
  /** URL in storage (DigitalOcean Spaces) */
  url: string;
  /** Storage key */
  key: string;
  /** MIME type */
  contentType: string;
  /** Size in bytes */
  size: number;
}

export interface IResource extends Document {
  _id: mongoose.Types.ObjectId;
  /** Title of the resource */
  title: string;
  /** Description */
  description?: string;
  /** Category for organization */
  category: ResourceCategory;
  /** Files attached to this resource */
  files: IResourceFile[];
  /** Who uploaded it (admin) */
  uploadedBy: mongoose.Types.ObjectId;
  /** Is this resource active/visible */
  isActive: boolean;
  /** Sort order */
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const ResourceFileSchema = new Schema<IResourceFile>(
  {
    fileName: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    key: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ResourceSchema = new Schema<IResource>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    category: {
      type: String,
      enum: ["brochure", "banner", "presentation", "document", "image", "video", "template", "other"],
      default: "other",
      index: true,
    },
    files: { type: [ResourceFileSchema], default: [] },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Resource ??
  mongoose.model<IResource>("Resource", ResourceSchema);
