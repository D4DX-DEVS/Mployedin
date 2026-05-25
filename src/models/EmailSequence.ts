import mongoose, { Document, Schema } from "mongoose";

export type SequenceStatus = "draft" | "active" | "paused" | "completed";
export type StepTrigger = "delay" | "condition";
export type StepCondition = "opened" | "clicked" | "replied" | "no_action";

export interface IEmailSequenceStep {
  order: number;
  subject: string;
  body: string;
  delayDays: number;
  condition?: StepCondition;
  templateId?: mongoose.Types.ObjectId;
}

export interface ISequenceRecipient {
  jobSeekerId?: mongoose.Types.ObjectId;
  email: string;
  name: string;
  currentStep: number;
  status: "active" | "completed" | "unsubscribed" | "bounced";
  lastSentAt?: Date;
  nextSendAt?: Date;
  openedSteps: number[];
  clickedSteps: number[];
}

export interface IEmailSequence extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  status: SequenceStatus;
  steps: IEmailSequenceStep[];
  recipients: ISequenceRecipient[];
  fromName: string;
  fromEmail: string;
  tags: string[];
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StepSchema = new Schema<IEmailSequenceStep>(
  {
    order: { type: Number, required: true },
    subject: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 10000 },
    delayDays: { type: Number, default: 1, min: 0, max: 90 },
    condition: { type: String, enum: ["opened", "clicked", "replied", "no_action"] },
    templateId: { type: Schema.Types.ObjectId, ref: "CommTemplate" },
  },
  { _id: true }
);

const RecipientSchema = new Schema<ISequenceRecipient>(
  {
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "JobSeeker" },
    email: { type: String, required: true },
    name: { type: String, required: true },
    currentStep: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "completed", "unsubscribed", "bounced"], default: "active" },
    lastSentAt: Date,
    nextSendAt: Date,
    openedSteps: [Number],
    clickedSteps: [Number],
  },
  { _id: true }
);

const EmailSequenceSchema = new Schema<IEmailSequence>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    status: { type: String, enum: ["draft", "active", "paused", "completed"], default: "draft" },
    steps: [StepSchema],
    recipients: [RecipientSchema],
    fromName: { type: String, maxlength: 100, default: "" },
    fromEmail: { type: String, maxlength: 200, default: "" },
    tags: [{ type: String, trim: true, maxlength: 50 }],
    totalSent: { type: Number, default: 0 },
    totalOpened: { type: Number, default: 0 },
    totalClicked: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

EmailSequenceSchema.index({ employerId: 1, status: 1 });
EmailSequenceSchema.index({ "recipients.nextSendAt": 1, status: 1 });

export default mongoose.models.EmailSequence || mongoose.model<IEmailSequence>("EmailSequence", EmailSequenceSchema);
