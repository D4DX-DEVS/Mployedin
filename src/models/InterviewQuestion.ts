import mongoose, { Document, Schema } from "mongoose";

export interface IQuestionItem {
  question: string;
  tests: string;
  strongAnswer: string;
  redFlag: string;
}

export interface IInterviewQuestion extends Document {
  _id: mongoose.Types.ObjectId;
  interviewId: mongoose.Types.ObjectId;
  generatedBy: mongoose.Types.ObjectId;
  questionType: "technical" | "behavioral" | "culture_fit" | "situational";
  questions: IQuestionItem[];
  jobTitle: string;
  candidateName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionItemSchema = new Schema<IQuestionItem>(
  {
    question: { type: String, required: true },
    tests: { type: String, required: true },
    strongAnswer: { type: String, required: true },
    redFlag: { type: String, required: true },
  },
  { _id: false }
);

const InterviewQuestionSchema = new Schema<IInterviewQuestion>(
  {
    interviewId: { type: Schema.Types.ObjectId, ref: "Interview", required: true },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    questionType: {
      type: String,
      enum: ["technical", "behavioral", "culture_fit", "situational"],
      required: true,
    },
    questions: { type: [QuestionItemSchema], required: true },
    jobTitle: { type: String, required: true },
    candidateName: { type: String },
  },
  { timestamps: true }
);

InterviewQuestionSchema.index({ interviewId: 1, questionType: 1, createdAt: -1 });
InterviewQuestionSchema.index({ generatedBy: 1 });

export const InterviewQuestion =
  mongoose.models.InterviewQuestion ||
  mongoose.model<IInterviewQuestion>("InterviewQuestion", InterviewQuestionSchema);

export default InterviewQuestion;
