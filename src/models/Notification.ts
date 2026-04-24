import mongoose, { Document, Schema } from "mongoose";

export type NotificationType =
  | "application_update"
  | "application_received"
  | "application_status_update"
  | "interview_scheduled"
  | "interview_reminder"
  | "interview_update"
  | "offer_update"
  | "placement"
  | "job_posted"
  | "job_approved"
  | "job_rejected"
  | "lead_converted"
  | "profile_update"
  | "message"
  | "system"
  | "payment"
  | "verification"
  | "agent_joined"
  | "employer_registered"
  | "placement_completed"
  | "new_job_posted";

export type NotificationChannel = "in_app" | "email" | "whatsapp";

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  channels: NotificationChannel[];
  isRead: boolean;
  readAt?: Date;
  isSent: boolean;
  sentAt?: Date;
  actionUrl?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "application_update",
        "application_received",
        "application_status_update",
        "interview_scheduled",
        "interview_reminder",
        "interview_update",
        "offer_update",
        "placement",
        "job_posted",
        "job_approved",
        "job_rejected",
        "lead_converted",
        "profile_update",
        "message",
        "system",
        "payment",
        "verification",
        "agent_joined",
        "employer_registered",
        "placement_completed",
        "new_job_posted",
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    channels: [
      {
        type: String,
        enum: ["in_app", "email", "whatsapp"],
      },
    ],
    isRead: { type: Boolean, default: false },
    readAt: Date,
    isSent: { type: Boolean, default: false },
    sentAt: Date,
    actionUrl: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ type: 1 });

export const Notification =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);
export default Notification;
