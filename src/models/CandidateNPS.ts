import mongoose, { Document, Schema } from "mongoose";

export interface ICandidateNPS extends Document {
  _id: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  rating: number;            // 1–5
  comment?: string;
  processStage: string;      // stage reached before end (e.g. "rejected", "hired")
  createdAt: Date;
}

const CandidateNPSSchema = new Schema<ICandidateNPS>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      unique: true, // one feedback per application
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 500 },
    processStage: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CandidateNPSSchema.index({ companyId: 1 });
CandidateNPSSchema.index({ candidateId: 1 });

export const CandidateNPS =
  mongoose.models.CandidateNPS ||
  mongoose.model<ICandidateNPS>("CandidateNPS", CandidateNPSSchema);
