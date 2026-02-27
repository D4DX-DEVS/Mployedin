import mongoose, { Document, Schema } from "mongoose";

export interface IFAQ extends Document {
  _id: mongoose.Types.ObjectId;
  question: string;
  questionAr: string;
  answer: string;
  answerAr: string;
  category: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FAQSchema = new Schema<IFAQ>(
  {
    question: { type: String, required: true, trim: true },
    questionAr: { type: String, default: "", trim: true },
    answer: { type: String, required: true },
    answerAr: { type: String, default: "" },
    category: { type: String, default: "general", trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FAQSchema.index({ isActive: 1, sortOrder: 1 });
FAQSchema.index({ category: 1 });

export const FAQ =
  mongoose.models.FAQ || mongoose.model<IFAQ>("FAQ", FAQSchema);

export default FAQ;
