import mongoose, { Document, Schema } from "mongoose";
import { PIPELINE_STAGES } from "@/lib/hiring/pipeline";

export type WorkflowTemplateScope = "system" | "employer";

export interface IWorkflowStageTemplate {
  id: string;
  label: string;
  /** The application status this stage runs under (see lib/hiring/workflowStages.ts). Absent on legacy rows. */
  phase?: string;
  /** Legacy editor flags. New templates list only the stages they use. */
  enabled?: boolean;
  autoProgress?: boolean;
  order: number;
}

/** Which jobs a template is picked for automatically (lib/hiring/workflowTemplateMatch.ts). */
export interface IWorkflowTemplateMatch {
  categories?: string[];
  employmentTypes?: string[];
  workModes?: string[];
  titleKeywords?: string[];
  minExperienceYears?: number | null;
}

export interface IWorkflowSettingsTemplate {
  /** Retired 2026-09-10 — scoring always runs. */
  aiAutoScreen?: boolean;
  notifyOnStageChange: boolean;
  autoRejectBelow: number;
  autoRejectEnabled?: boolean;
  shortlistTarget?: number;
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
  /** Archived templates stay on the jobs that use them but are never picked again. */
  isActive?: boolean;
  /** Bumped on every edit; a job records the version it was given. */
  version?: number;
  /** Tie-break between templates that both match a job (higher wins). */
  priority?: number;
  match?: IWorkflowTemplateMatch;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowStageSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, maxlength: 100 },
    phase: { type: String, enum: [...PIPELINE_STAGES] },
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
      autoRejectEnabled: { type: Boolean, default: false },
      shortlistTarget: { type: Number, default: 50, min: 5, max: 100 },
    },
    tags: [{ type: String, maxlength: 50 }],
    isDefault: { type: Boolean, default: false },
    // No defaults: queries read a missing flag as active / version 1 / priority 0
    // (`isActive: { $ne: false }`), so legacy rows need no migration.
    isActive: Boolean,
    version: Number,
    priority: { type: Number, min: 0, max: 100 },
    match: {
      categories: { type: [String], default: undefined },
      employmentTypes: { type: [String], default: undefined },
      workModes: { type: [String], default: undefined },
      titleKeywords: { type: [String], default: undefined },
      minExperienceYears: { type: Number, min: 0, max: 40 },
    },
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
