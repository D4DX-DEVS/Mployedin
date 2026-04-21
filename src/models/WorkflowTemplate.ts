import mongoose, { Document, Schema } from "mongoose";

export type WorkflowTemplateScope = "system" | "employer";

export interface IWorkflowStageTemplate {
  id: string;
  label: string;
  enabled: boolean;
  autoProgress: boolean;
  order: number;
}

export interface IWorkflowSettingsTemplate {
  aiAutoScreen: boolean;
  notifyOnStageChange: boolean;
  autoRejectBelow: number;
}

export interface IWorkflowTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  scope: WorkflowTemplateScope;
  /** System templates: undefined. Employer templates: employerId */
  employerId?: mongoose.Types.ObjectId;
  stages: IWorkflowStageTemplate[];
  settings: IWorkflowSettingsTemplate;
  /** Tags for categorization (e.g. "tech", "sales", "healthcare") */
  tags?: string[];
  isDefault: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowStageSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, maxlength: 100 },
    enabled: { type: Boolean, default: true },
    autoProgress: { type: Boolean, default: false },
    order: { type: Number, required: true },
  },
  { _id: false },
);

const WorkflowTemplateSchema = new Schema<IWorkflowTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 500, trim: true },
    scope: {
      type: String,
      enum: ["system", "employer"],
      required: true,
    },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer" },
    stages: {
      type: [WorkflowStageSchema],
      validate: [(v: unknown[]) => v.length <= 20, "Maximum 20 stages allowed"],
    },
    settings: {
      aiAutoScreen: { type: Boolean, default: true },
      notifyOnStageChange: { type: Boolean, default: true },
      autoRejectBelow: { type: Number, default: 40, min: 0, max: 100 },
    },
    tags: [{ type: String, maxlength: 50 }],
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

WorkflowTemplateSchema.index({ scope: 1 });
WorkflowTemplateSchema.index({ employerId: 1 });
WorkflowTemplateSchema.index({ scope: 1, isDefault: 1 });

export const WorkflowTemplate =
  mongoose.models.WorkflowTemplate ||
  mongoose.model<IWorkflowTemplate>("WorkflowTemplate", WorkflowTemplateSchema);
export default WorkflowTemplate;
