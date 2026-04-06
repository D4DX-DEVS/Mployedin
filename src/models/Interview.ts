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

export interface IInterview extends Document {
  _id: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  type: InterviewType;
  scheduledAt: Date;
  duration: InterviewDuration;
  location?: string;
  meetLink?: string;
  instructions?: string;
  reminderSent: boolean;
  reminderSentAt?: Date;
  status: InterviewStatus;
  feedback?: string;
  feedbackBy?: mongoose.Types.ObjectId;
  outcome?: "passed" | "failed" | "hold" | "no_show";
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
    duration: { type: Number, enum: [15, 30, 45, 60], default: 30 },
    location: String,
    meetLink: String,
    instructions: String,
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: Date,
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

export const Interview =
  mongoose.models.Interview ||
  mongoose.model<IInterview>("Interview", InterviewSchema);
export default Interview;
