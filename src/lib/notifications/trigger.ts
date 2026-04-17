/**
 * Notification trigger service
 *
 * Emits events to the Inngest notification orchestrator instead of
 * sending email/WhatsApp inline. In-app notification is still created
 * synchronously (fast) so the UI can show it immediately.
 *
 * Flow: notify() → create in-app doc → emit Inngest event → return
 *       Inngest worker → check preferences → dedup → send email/whatsapp
 */

import { connectDB } from "@/lib/db/mongoose";
import Notification from "@/models/Notification";
import { inngest } from "@/lib/inngest/client";

export type NotificationType =
  | "application_received"
  | "application_status_update"
  | "interview_scheduled"
  | "interview_reminder"
  | "interview_update"
  | "offer_update"
  | "job_posted"
  | "job_approved"
  | "job_rejected"
  | "lead_converted"
  | "mention"
  | "system";

interface NotifyPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  sendEmail?: boolean;
  sendWhatsApp?: boolean;
  metadata?: Record<string, unknown>;
}

export async function notify(payload: NotifyPayload): Promise<void> {
  await connectDB();

  // Always create an in-app notification synchronously (fast, no queue needed)
  await Notification.create({
    userId: payload.userId,
    type: payload.type,
    title: payload.title,
    body: payload.message,
    actionUrl: payload.link,
    meta: payload.metadata,
    channels: ["in_app"],
    isRead: false,
  });

  // Emit event to Inngest for async email/WhatsApp delivery
  // The orchestrator handles: preference checks, dedup, retries, channel routing
  if (payload.sendEmail || payload.sendWhatsApp) {
    try {
      await inngest.send({
        name: "notification/instant",
        data: {
          userId: payload.userId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          link: payload.link,
          sendEmail: payload.sendEmail,
          sendWhatsApp: payload.sendWhatsApp,
          metadata: payload.metadata,
        },
      });
    } catch (err) {
      // Log but don't block — in-app notification was already created
      console.error("[notify] Failed to emit Inngest event:", err);
    }
  }
}

// Convenience trigger functions
export async function notifyApplicationReceived(
  jobSeekerId: string,
  jobSeekername: string,
  jobTitle: string,
  companyName: string,
  applicationId: string
): Promise<void> {
  await notify({
    userId: jobSeekerId,
    type: "application_received",
    title: "Application Received",
    message: `Your application for "${jobTitle}" at ${companyName} has been submitted successfully.`,
    link: `/en/job-seeker/applications`,
    sendEmail: true,
    metadata: { jobTitle, companyName, applicationId },
  });
}

export async function notifyStatusChange(
  jobSeekerId: string,
  jobTitle: string,
  status: string,
  applicationId: string
): Promise<void> {
  await notify({
    userId: jobSeekerId,
    type: "application_status_update",
    title: "Application Status Updated",
    message: `Your application for "${jobTitle}" has been moved to: ${status.toUpperCase()}.`,
    link: `/en/job-seeker/applications`,
    sendEmail: true,
    metadata: { jobTitle, status, applicationId },
  });
}

export async function notifyInterviewScheduled(
  jobSeekerId: string,
  jobTitle: string,
  scheduledAt: Date,
  location: string,
  interviewId: string
): Promise<void> {
  const dateStr = scheduledAt.toLocaleString("en-AE", { timeZone: "Asia/Dubai" });
  await notify({
    userId: jobSeekerId,
    type: "interview_scheduled",
    title: "Interview Scheduled",
    message: `Your interview for "${jobTitle}" is scheduled for ${dateStr} at ${location}.`,
    link: `/en/job-seeker/interviews`,
    sendEmail: true,
    sendWhatsApp: true,
    metadata: { jobTitle, scheduledAt, location, interviewId },
  });
}

export async function notifyInterviewSelected(
  jobSeekerId: string,
  jobTitle: string,
  companyName: string,
  applicationId: string
): Promise<void> {
  await notify({
    userId: jobSeekerId,
    type: "interview_scheduled",
    title: "Congratulations! Selected for Interview",
    message: `Great news! You have been selected for an interview for the "${jobTitle}" position at ${companyName}. The employer will reach out to you soon with further details.`,
    link: `/en/job-seeker/applications`,
    sendEmail: true,
    metadata: { jobTitle, companyName, applicationId },
  });
}

export async function notifyOfferMade(
  jobSeekerId: string,
  jobTitle: string,
  companyName: string,
  applicationId: string
): Promise<void> {
  await notify({
    userId: jobSeekerId,
    type: "offer_update",
    title: "Offer Extended!",
    message: `${companyName} has extended an offer to you for the "${jobTitle}" position. Log in to review the details.`,
    link: `/en/job-seeker/applications`,
    sendEmail: true,
    metadata: { jobTitle, companyName, applicationId },
  });
}

export async function notifyRejected(
  jobSeekerId: string,
  jobTitle: string,
  applicationId: string
): Promise<void> {
  await notify({
    userId: jobSeekerId,
    type: "application_status_update",
    title: "Application Update",
    message: `We're sorry to inform you that your application for "${jobTitle}" was not selected at this time. Keep applying — the right opportunity is ahead.`,
    link: `/en/job-seeker/applications`,
    sendEmail: true,
    metadata: { jobTitle, applicationId },
  });
}

export async function notifyMention(
  mentionedUserId: string,
  authorName: string,
  applicationId: string,
  candidateName: string
): Promise<void> {
  await notify({
    userId: mentionedUserId,
    type: "mention",
    title: "You were mentioned in a note",
    message: `${authorName} mentioned you in a note on ${candidateName}'s application.`,
    link: `/en/employer/applications?highlight=${applicationId}`,
    sendEmail: false,
    metadata: { applicationId, authorName },
  });
}
