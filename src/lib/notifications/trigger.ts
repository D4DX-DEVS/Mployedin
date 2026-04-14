/**
 * Notification trigger service
 * Creates in-app Notification documents and optionally sends email/WhatsApp
 */

import { connectDB } from "@/lib/db/mongoose";
import Notification from "@/models/Notification";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { sendWhatsApp, WhatsAppTemplates } from "@/lib/communications/whatsapp";
import User from "@/models/User";

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

  // Always create an in-app notification
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

  // Optionally send email/WhatsApp
  if (payload.sendEmail || payload.sendWhatsApp) {
    const user = await User.findById(payload.userId).select("name email phone").lean();
    if (!user) return;

    if (payload.sendEmail && user.email) {
      try {
        await sendEmail({
          to: user.email,
          subject: payload.title,
          html: `<p>${payload.message}</p>${payload.link ? `<p><a href="${payload.link}">View Details</a></p>` : ""}`,
        });
      } catch (err) {
        console.error("[notify] Email send failed:", err);
      }
    }

    if (payload.sendWhatsApp && (user as { phone?: string }).phone) {
      try {
        await sendWhatsApp({
          to: (user as { phone: string }).phone,
          body: `${payload.title}\n\n${payload.message}`,
        });
      } catch (err) {
        console.error("[notify] WhatsApp send failed:", err);
      }
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
