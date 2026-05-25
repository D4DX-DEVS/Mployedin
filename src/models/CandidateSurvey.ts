import mongoose, { Document, Schema } from "mongoose";

export type SurveyTrigger = "post_interview" | "post_rejection" | "post_hire" | "post_offer" | "manual";

export interface ISurveyQuestion {
  id: string;
  text: string;
  type: "rating" | "text" | "multiple_choice" | "yes_no";
  options?: string[];
  required: boolean;
  order: number;
}

export interface ISurveyTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  name: string;
  trigger: SurveyTrigger;
  questions: ISurveyQuestion[];
  isActive: boolean;
  sendDelayHours: number; // hours after trigger to send
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISurveyResponse extends Document {
  _id: mongoose.Types.ObjectId;
  surveyTemplateId: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  answers: { questionId: string; value: string | number }[];
  overallRating?: number; // 1-5
  comment?: string;
  trigger: SurveyTrigger;
  submittedAt: Date;
}

const QuestionSchema = new Schema<ISurveyQuestion>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, maxlength: 300 },
    type: { type: String, enum: ["rating", "text", "multiple_choice", "yes_no"], required: true },
    options: [{ type: String, maxlength: 100 }],
    required: { type: Boolean, default: true },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const SurveyTemplateSchema = new Schema<ISurveyTemplate>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    trigger: { type: String, enum: ["post_interview", "post_rejection", "post_hire", "post_offer", "manual"], required: true },
    questions: [QuestionSchema],
    isActive: { type: Boolean, default: true },
    sendDelayHours: { type: Number, default: 24, min: 0, max: 720 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

SurveyTemplateSchema.index({ employerId: 1, trigger: 1 });

const SurveyResponseSchema = new Schema<ISurveyResponse>(
  {
    surveyTemplateId: { type: Schema.Types.ObjectId, ref: "SurveyTemplate", required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: "Application", required: true },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    answers: [{
      questionId: { type: String, required: true },
      value: { type: Schema.Types.Mixed, required: true },
    }],
    overallRating: { type: Number, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000 },
    trigger: { type: String, enum: ["post_interview", "post_rejection", "post_hire", "post_offer", "manual"] },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SurveyResponseSchema.index({ employerId: 1, trigger: 1 });
SurveyResponseSchema.index({ applicationId: 1 });

export const SurveyTemplate =
  mongoose.models.SurveyTemplate || mongoose.model<ISurveyTemplate>("SurveyTemplate", SurveyTemplateSchema);

export const SurveyResponse =
  mongoose.models.SurveyResponse || mongoose.model<ISurveyResponse>("SurveyResponse", SurveyResponseSchema);
