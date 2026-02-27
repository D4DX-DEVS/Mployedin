import mongoose, { Document, Schema } from "mongoose";

export interface ITestimonial extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  designation: string;
  designationAr: string;
  company: string;
  companyAr: string;
  quote: string;
  quoteAr: string;
  avatar: string;
  rating: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TestimonialSchema = new Schema<ITestimonial>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    designation: { type: String, default: "", trim: true },
    designationAr: { type: String, default: "", trim: true },
    company: { type: String, default: "", trim: true },
    companyAr: { type: String, default: "", trim: true },
    quote: { type: String, required: true },
    quoteAr: { type: String, default: "" },
    avatar: { type: String, default: "" },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

TestimonialSchema.index({ isActive: 1, sortOrder: 1 });

export const Testimonial =
  mongoose.models.Testimonial ||
  mongoose.model<ITestimonial>("Testimonial", TestimonialSchema);

export default Testimonial;
