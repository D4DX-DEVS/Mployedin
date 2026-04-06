import mongoose, { Document, Schema } from "mongoose";

export type CommTemplateType = "rejection" | "invite" | "followup" | "offer";

export interface ICommTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  name: string;
  type: CommTemplateType;
  subject: string;
  body: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CommTemplateSchema = new Schema<ICommTemplate>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    type: {
      type: String,
      enum: ["rejection", "invite", "followup", "offer"],
      required: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 5000 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CommTemplateSchema.index({ employerId: 1 });
CommTemplateSchema.index({ employerId: 1, type: 1 });

export const CommTemplate =
  mongoose.models.CommTemplate ||
  mongoose.model<ICommTemplate>("CommTemplate", CommTemplateSchema);

export default CommTemplate;
