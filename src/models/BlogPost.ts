import mongoose, { Document, Schema } from "mongoose";

export type BlogStatus = "draft" | "published";

export interface IBlogPost extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  titleAr: string;
  slug: string;
  excerpt: string;
  excerptAr: string;
  body: string;
  bodyAr: string;
  coverImage: string;
  author: string;
  tags: string[];
  status: BlogStatus;
  publishedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BlogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true },
    titleAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, default: "", trim: true },
    excerptAr: { type: String, default: "", trim: true },
    body: { type: String, required: true },
    bodyAr: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    author: { type: String, default: "", trim: true },
    tags: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    publishedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

BlogPostSchema.index({ slug: 1 }, { unique: true });
BlogPostSchema.index({ status: 1, publishedAt: -1 });
BlogPostSchema.index({ isActive: 1 });
BlogPostSchema.index({ tags: 1 });

export const BlogPost =
  mongoose.models.BlogPost || mongoose.model<IBlogPost>("BlogPost", BlogPostSchema);

export default BlogPost;
