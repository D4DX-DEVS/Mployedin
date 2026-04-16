import mongoose, { Document, Schema } from "mongoose";

export type BroadcastTemplateType = "onboarding" | "transactional" | "marketing" | "system";

export interface IBroadcastTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  type: BroadcastTemplateType;
  subject: string;
  body: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BroadcastTemplateSchema = new Schema<IBroadcastTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    type: {
      type: String,
      enum: ["onboarding", "transactional", "marketing", "system"],
      required: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 5000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

BroadcastTemplateSchema.index({ createdBy: 1 });
BroadcastTemplateSchema.index({ type: 1 });

export const BroadcastTemplate =
  mongoose.models.BroadcastTemplate ||
  mongoose.model<IBroadcastTemplate>("BroadcastTemplate", BroadcastTemplateSchema);

export default BroadcastTemplate;
