import mongoose, { Document, Schema } from "mongoose";

/**
 * EmailLog — tracks every email sent through the platform.
 * Provides admin visibility into delivery status, failures, and volume.
 */

export type EmailStatus = "sent" | "failed" | "bounced" | "delivered";

export interface IEmailLog extends Document {
  _id: mongoose.Types.ObjectId;
  userId?: string;
  to: string;
  subject: string;
  category: string; // "jobs" | "applications" | "interviews" | "marketing" | "system" | "broadcast" | "re-engagement" | "digest"
  status: EmailStatus;
  messageId?: string;
  errorMessage?: string;
  source: string; // "orchestrator" | "daily-digest" | "weekly-digest" | "re-engagement" | "profile-completion" | "job-expiry" | "broadcast" | "test" | "direct"
  metadata?: Record<string, unknown>;
  sentAt: Date;
  createdAt: Date;
}

const EmailLogSchema = new Schema<IEmailLog>(
  {
    userId: { type: String, index: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    category: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["sent", "failed", "bounced", "delivered"],
      default: "sent",
      index: true,
    },
    messageId: String,
    errorMessage: String,
    source: { type: String, required: true, index: true },
    metadata: Schema.Types.Mixed,
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

// Compound indexes for admin queries
EmailLogSchema.index({ sentAt: -1 });
EmailLogSchema.index({ status: 1, sentAt: -1 });
EmailLogSchema.index({ userId: 1, sentAt: -1 });
EmailLogSchema.index({ source: 1, sentAt: -1 });

// TTL: auto-delete logs older than 90 days
EmailLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

/**
 * Log an email delivery attempt.
 */
export async function logEmailDelivery(data: {
  userId?: string;
  to: string;
  subject: string;
  category: string;
  source: string;
  status: EmailStatus;
  messageId?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await EmailLog.create({
      ...data,
      sentAt: new Date(),
    });
  } catch {
    // Don't let logging failures break email delivery
    console.error("[email-log] Failed to log email delivery");
  }
}

export const EmailLog =
  mongoose.models.EmailLog ||
  mongoose.model<IEmailLog>("EmailLog", EmailLogSchema);
export default EmailLog;
