import mongoose, { Document, Schema } from "mongoose";

export type InterviewType = "video" | "offline" | "hybrid";
export type InterviewStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rescheduled";
export type InterviewDuration = 15 | 30 | 45 | 60;
export type CandidateResponse = "pending" | "confirmed" | "declined" | "reschedule_requested";

export type InterviewOutcome = "passed" | "failed" | "hold" | "no_show";

export interface IInterview extends Document {
  _id: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  type: InterviewType;
  scheduledAt: Date;
  duration: number;
  location?: string;
  meetLink?: string;
  instructions?: string;
  reminderSent: boolean;
  reminderSentAt?: Date;
  metadata?: { oneHourReminderSent?: boolean };
  status: InterviewStatus;
  feedback?: string;
  feedbackBy?: mongoose.Types.ObjectId;
  outcome?: InterviewOutcome;
  interviewRound: number;
  rescheduleCount: number;
  candidateResponse: CandidateResponse;
  candidateResponseAt?: Date;
  candidateRescheduleNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InterviewSchema = new Schema<IInterview>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    jobSeekerId: {
      type: Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
    },
    employerId: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
    },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    type: {
      type: String,
      enum: ["video", "offline", "hybrid"],
      required: true,
    },
    scheduledAt: { type: Date, required: true },
    duration: { type: Number, min: 15, max: 480, default: 30 },
    location: String,
    meetLink: String,
    instructions: String,
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: Date,
    // Dedup flag for the 1-hour reminder. Previously written by the cron via
    // dot-notation but absent from the schema → strict mode dropped it → duplicate
    // 1h reminders fired every run. Defined here so the write persists.
    metadata: {
      oneHourReminderSent: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: [
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
        "rescheduled",
      ],
      default: "scheduled",
    },
    feedback: String,
    feedbackBy: { type: Schema.Types.ObjectId, ref: "User" },
    outcome: {
      type: String,
      enum: ["passed", "failed", "hold", "no_show"],
    },
    interviewRound: { type: Number, default: 1, min: 1 },
    rescheduleCount: { type: Number, default: 0 },
    candidateResponse: {
      type: String,
      enum: ["pending", "confirmed", "declined", "reschedule_requested"],
      default: "pending",
    },
    candidateResponseAt: Date,
    candidateRescheduleNote: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

InterviewSchema.index({ applicationId: 1 });
InterviewSchema.index({ jobSeekerId: 1 });
InterviewSchema.index({ employerId: 1 });
InterviewSchema.index({ scheduledAt: 1 });
InterviewSchema.index({ status: 1 });
// Prevent duplicate active interviews for same application + round (race condition guard)
InterviewSchema.index(
  { applicationId: 1, interviewRound: 1 },
  {   name: "unique_active_interview_round_per_application", unique: true, partialFilterExpression: { status: { $in: ["scheduled", "confirmed"] } } }
);

export const Interview =
  mongoose.models.Interview ||
  mongoose.model<IInterview>("Interview", InterviewSchema);
export default Interview;
