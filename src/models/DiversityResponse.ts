import mongoose, { Document, Schema } from "mongoose";

export interface IDiversityResponse extends Document {
  _id: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  // All fields are voluntary and anonymized
  gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
  ethnicity?: string;
  veteranStatus?: "yes" | "no" | "prefer_not_to_say";
  disabilityStatus?: "yes" | "no" | "prefer_not_to_say";
  ageRange?: "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+";
  submittedAt: Date;
}

export interface IDiversityReport {
  totalApplications: number;
  responseRate: number;
  genderDistribution: Record<string, number>;
  ethnicityDistribution: Record<string, number>;
  ageDistribution: Record<string, number>;
  veteranRate: number;
  disabilityRate: number;
}

const DiversityResponseSchema = new Schema<IDiversityResponse>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: "Application", required: true, unique: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    gender: { type: String, enum: ["male", "female", "non_binary", "prefer_not_to_say"] },
    ethnicity: { type: String, maxlength: 100 },
    veteranStatus: { type: String, enum: ["yes", "no", "prefer_not_to_say"] },
    disabilityStatus: { type: String, enum: ["yes", "no", "prefer_not_to_say"] },
    ageRange: { type: String, enum: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DiversityResponseSchema.index({ employerId: 1 });
DiversityResponseSchema.index({ jobId: 1 });

export default mongoose.models.DiversityResponse || mongoose.model<IDiversityResponse>("DiversityResponse", DiversityResponseSchema);
