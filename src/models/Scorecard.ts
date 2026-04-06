import mongoose, { Document, Schema } from "mongoose";

export interface IScorecard extends Document {
  _id: mongoose.Types.ObjectId;
  interviewId: mongoose.Types.ObjectId;      // ref Interview
  applicationId: mongoose.Types.ObjectId;    // ref Application
  jobSeekerId: mongoose.Types.ObjectId;      // ref JobSeeker
  employerId: mongoose.Types.ObjectId;       // ref Employer
  evaluatedBy: mongoose.Types.ObjectId;      // ref User (who filled in)
  scores: {
    technicalSkills: number;   // 1-5
    communication: number;     // 1-5
    cultureFit: number;        // 1-5
    problemSolving: number;    // 1-5
    motivation: number;        // 1-5
  };
  overallScore: number;        // computed avg of scores, stored for querying
  recommendation: "strong_yes" | "yes" | "neutral" | "no" | "strong_no";
  notes?: string;              // max 3000 chars
  strengths?: string;          // max 1000
  concerns?: string;           // max 1000
  createdAt: Date;
  updatedAt: Date;
}

const ScorecardSchema = new Schema<IScorecard>(
  {
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: "Interview",
      required: true,
      index: true,
      unique: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    jobSeekerId: {
      type: Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
    },
    employerId: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    evaluatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    scores: {
      technicalSkills: { type: Number, min: 1, max: 5, required: true },
      communication: { type: Number, min: 1, max: 5, required: true },
      cultureFit: { type: Number, min: 1, max: 5, required: true },
      problemSolving: { type: Number, min: 1, max: 5, required: true },
      motivation: { type: Number, min: 1, max: 5, required: true },
    },
    overallScore: { type: Number, required: true },
    recommendation: {
      type: String,
      enum: ["strong_yes", "yes", "neutral", "no", "strong_no"],
      required: true,
    },
    notes: { type: String, maxlength: 3000 },
    strengths: { type: String, maxlength: 1000 },
    concerns: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

ScorecardSchema.index({ applicationId: 1 });
ScorecardSchema.index({ employerId: 1 });

export const Scorecard =
  mongoose.models.Scorecard ||
  mongoose.model<IScorecard>("Scorecard", ScorecardSchema);
export default Scorecard;
