import mongoose, { Document, Schema } from "mongoose";

export type QuestionType = "multiple_choice" | "true_false" | "short_answer" | "code";

export interface IAssessmentQuestion {
  id: string;
  question: string;
  type: QuestionType;
  options?: string[];
  correctAnswer?: string;
  points: number;
  timeLimit?: number; // seconds per question
  codeLanguage?: string;
  explanation?: string;
  order: number;
}

export interface ISkillAssessment extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  skills: string[];
  questions: IAssessmentQuestion[];
  totalPoints: number;
  passingScore: number;
  timeLimit: number; // minutes for entire assessment
  isActive: boolean;
  jobIds: mongoose.Types.ObjectId[];
  attemptsAllowed: number;
  totalAttempts: number;
  avgScore: number;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentQuestionSchema = new Schema(
  {
    id: { type: String, required: true },
    question: { type: String, required: true, maxlength: 2000 },
    type: { type: String, enum: ["multiple_choice", "true_false", "short_answer", "code"], required: true },
    options: [{ type: String, maxlength: 500 }],
    correctAnswer: { type: String },
    points: { type: Number, required: true, min: 1 },
    timeLimit: { type: Number, min: 10 },
    codeLanguage: { type: String },
    explanation: { type: String, maxlength: 1000 },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const SkillAssessmentSchema = new Schema<ISkillAssessment>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    skills: [{ type: String }],
    questions: [AssessmentQuestionSchema],
    totalPoints: { type: Number, default: 0 },
    passingScore: { type: Number, default: 60 },
    timeLimit: { type: Number, default: 30, min: 5 },
    isActive: { type: Boolean, default: true },
    jobIds: [{ type: Schema.Types.ObjectId, ref: "Job" }],
    attemptsAllowed: { type: Number, default: 1, min: 1 },
    totalAttempts: { type: Number, default: 0 },
    avgScore: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SkillAssessmentSchema.index({ employerId: 1, isActive: 1 });
SkillAssessmentSchema.index({ jobIds: 1 });

export const SkillAssessment =
  mongoose.models.SkillAssessment ||
  mongoose.model<ISkillAssessment>("SkillAssessment", SkillAssessmentSchema);
export default SkillAssessment;
