import mongoose, { Document, Schema } from "mongoose";

export interface IAssessmentAttempt extends Document {
  _id: mongoose.Types.ObjectId;
  assessmentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  jobId?: mongoose.Types.ObjectId;
  answers: {
    questionId: string;
    answer: string;
    isCorrect?: boolean;
    pointsEarned: number;
    timeTaken?: number;
  }[];
  totalScore: number;
  percentage: number;
  passed: boolean;
  startedAt: Date;
  completedAt?: Date;
  status: "in_progress" | "completed" | "timed_out" | "abandoned";
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentAttemptSchema = new Schema<IAssessmentAttempt>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: "SkillAssessment", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
    answers: [{
      questionId: { type: String, required: true },
      answer: { type: String },
      isCorrect: { type: Boolean },
      pointsEarned: { type: Number, default: 0 },
      timeTaken: { type: Number },
      _id: false,
    }],
    totalScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    status: { type: String, enum: ["in_progress", "completed", "timed_out", "abandoned"], default: "in_progress" },
  },
  { timestamps: true }
);

AssessmentAttemptSchema.index({ assessmentId: 1, userId: 1 });
AssessmentAttemptSchema.index({ userId: 1, status: 1 });
AssessmentAttemptSchema.index({ jobId: 1 });

export const AssessmentAttempt =
  mongoose.models.AssessmentAttempt ||
  mongoose.model<IAssessmentAttempt>("AssessmentAttempt", AssessmentAttemptSchema);
export default AssessmentAttempt;
