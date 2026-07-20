import mongoose, { Document, Schema } from "mongoose";

export type MatchingWeightTemplateScope = "system" | "employer";

export interface IMatchingWeightValues {
  skills: number;
  experience: number;
  education: number;
  industryExperience: number;
  preferredQualifications: number;
}

export interface IMatchingWeightTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  scope: MatchingWeightTemplateScope;
  /** System templates: undefined. Employer templates: employerId */
  employerId?: mongoose.Types.ObjectId;
  weights: IMatchingWeightValues;
  /** Tags for categorization (e.g. "tech", "sales", "healthcare") */
  tags?: string[];
  isDefault: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MatchingWeightTemplateSchema = new Schema<IMatchingWeightTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 500, trim: true },
    scope: {
      type: String,
      enum: ["system", "employer"],
      required: true,
    },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer" },
    weights: {
      skills: { type: Number, required: true, min: 0, max: 100 },
      experience: { type: Number, required: true, min: 0, max: 100 },
      education: { type: Number, required: true, min: 0, max: 100 },
      industryExperience: { type: Number, required: true, min: 0, max: 100 },
      preferredQualifications: { type: Number, required: true, min: 0, max: 100 },
    },
    tags: [{ type: String, maxlength: 50 }],
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

MatchingWeightTemplateSchema.index({ scope: 1 });
MatchingWeightTemplateSchema.index({ employerId: 1 });
MatchingWeightTemplateSchema.index({ scope: 1, isDefault: 1 });

export const MatchingWeightTemplate =
  mongoose.models.MatchingWeightTemplate ||
  mongoose.model<IMatchingWeightTemplate>("MatchingWeightTemplate", MatchingWeightTemplateSchema);
export default MatchingWeightTemplate;
