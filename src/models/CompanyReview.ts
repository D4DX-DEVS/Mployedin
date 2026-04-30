import mongoose, { Document, Schema } from "mongoose";

export interface ICompanyReview extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  rating: number;
  title: string;
  pros: string;
  cons: string;
  overallExperience?: "positive" | "neutral" | "negative";
  employmentStatus?: "current" | "former";
  jobTitle?: string;
  recommendToFriend?: boolean;
  status: "pending" | "approved" | "rejected";
  helpfulCount: number;
  reportCount: number;
  isAnonymous: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CompanyReviewSchema = new Schema<ICompanyReview>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    pros: { type: String, required: true, maxlength: 2000 },
    cons: { type: String, required: true, maxlength: 2000 },
    overallExperience: { type: String, enum: ["positive", "neutral", "negative"] },
    employmentStatus: { type: String, enum: ["current", "former"] },
    jobTitle: { type: String, trim: true, maxlength: 100 },
    recommendToFriend: { type: Boolean },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    helpfulCount: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
    isAnonymous: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CompanyReviewSchema.index({ employerId: 1, status: 1, createdAt: -1 });
CompanyReviewSchema.index({ userId: 1 });
CompanyReviewSchema.index({ employerId: 1, userId: 1 }, { unique: true });

export const CompanyReview =
  mongoose.models.CompanyReview ||
  mongoose.model<ICompanyReview>("CompanyReview", CompanyReviewSchema);
export default CompanyReview;
