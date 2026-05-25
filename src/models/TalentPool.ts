import mongoose, { Document, Schema } from "mongoose";

export interface ITalentPoolCandidate {
  jobSeekerId: mongoose.Types.ObjectId;
  addedBy: mongoose.Types.ObjectId;
  addedAt: Date;
  source: "rejected" | "withdrawn" | "manual" | "expired";
  sourceApplicationId?: mongoose.Types.ObjectId;
  notes?: string;
  tags?: string[];
}

export interface ITalentPool extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  candidates: ITalentPoolCandidate[];
  tags: string[];
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TalentPoolCandidateSchema = new Schema<ITalentPoolCandidate>(
  {
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "JobSeeker", required: true },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    addedAt: { type: Date, default: Date.now },
    source: { type: String, enum: ["rejected", "withdrawn", "manual", "expired"], default: "manual" },
    sourceApplicationId: { type: Schema.Types.ObjectId, ref: "Application" },
    notes: { type: String, maxlength: 500 },
    tags: [{ type: String, trim: true, maxlength: 50 }],
  },
  { _id: true }
);

const TalentPoolSchema = new Schema<ITalentPool>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    candidates: [TalentPoolCandidateSchema],
    tags: [{ type: String, trim: true, maxlength: 50 }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

TalentPoolSchema.index({ employerId: 1 });
TalentPoolSchema.index({ "candidates.jobSeekerId": 1 });
TalentPoolSchema.index({ tags: 1 });

export default mongoose.models.TalentPool || mongoose.model<ITalentPool>("TalentPool", TalentPoolSchema);
