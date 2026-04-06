import mongoose, { Document, Schema } from "mongoose";

export interface IJobTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  name: string; // template name e.g. "Senior Dev Template"
  // core job fields (all optional, whatever was saved)
  title?: string;
  description?: string;
  category?: string;
  requirements?: {
    skills?: string[];
    experienceMin?: number;
    experienceMax?: number;
    education?: string;
    languages?: string[];
  };
  salary?: { min?: number; max?: number; currency?: string; isNegotiable?: boolean };
  location?: { country?: string; city?: string; isRemote?: boolean };
  tags?: string[];
  vacancies?: number;
  applicationMode?: "auto" | "manual";
  createdAt: Date;
  updatedAt: Date;
}

const JobTemplateSchema = new Schema<IJobTemplate>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    title: { type: String, trim: true },
    description: String,
    category: String,
    requirements: {
      skills: [String],
      experienceMin: Number,
      experienceMax: Number,
      education: String,
      languages: [String],
    },
    salary: {
      min: Number,
      max: Number,
      currency: String,
      isNegotiable: Boolean,
    },
    location: {
      country: String,
      city: String,
      isRemote: Boolean,
    },
    tags: [String],
    vacancies: Number,
    applicationMode: { type: String, enum: ["auto", "manual"] },
  },
  { timestamps: true }
);

JobTemplateSchema.index({ employerId: 1 });

export const JobTemplate =
  mongoose.models.JobTemplate || mongoose.model<IJobTemplate>("JobTemplate", JobTemplateSchema);
export default JobTemplate;
