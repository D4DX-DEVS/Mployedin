import mongoose, { Document, Schema } from "mongoose";

export type CustomFieldType = "text" | "textarea" | "number" | "select" | "multi_select" | "date" | "url" | "file" | "checkbox" | "radio";

export interface ICustomField {
  _id?: mongoose.Types.ObjectId;
  label: string;
  key: string;
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[]; // for select/radio/multi_select
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  order: number;
}

export interface IApplicationForm extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  jobId?: mongoose.Types.ObjectId; // if job-specific; null = default form
  name: string;
  description?: string;
  fields: ICustomField[];
  isDefault: boolean;
  collectResume: boolean;
  collectCoverLetter: boolean;
  collectLinkedIn: boolean;
  collectPortfolio: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomFieldSchema = new Schema<ICustomField>(
  {
    label: { type: String, required: true, maxlength: 100 },
    key: { type: String, required: true, maxlength: 50 },
    type: { type: String, enum: ["text", "textarea", "number", "select", "multi_select", "date", "url", "file", "checkbox", "radio"], required: true },
    required: { type: Boolean, default: false },
    placeholder: { type: String, maxlength: 200 },
    helpText: { type: String, maxlength: 300 },
    options: [{ type: String, maxlength: 100 }],
    validation: {
      min: Number,
      max: Number,
      pattern: String,
    },
    order: { type: Number, required: true },
  },
  { _id: true }
);

const ApplicationFormSchema = new Schema<IApplicationForm>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    fields: [CustomFieldSchema],
    isDefault: { type: Boolean, default: false },
    collectResume: { type: Boolean, default: true },
    collectCoverLetter: { type: Boolean, default: false },
    collectLinkedIn: { type: Boolean, default: false },
    collectPortfolio: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ApplicationFormSchema.index({ employerId: 1, isDefault: 1 });
ApplicationFormSchema.index({ jobId: 1 });

export default mongoose.models.ApplicationForm || mongoose.model<IApplicationForm>("ApplicationForm", ApplicationFormSchema);
