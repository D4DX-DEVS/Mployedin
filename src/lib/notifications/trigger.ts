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
  | "payment"
  | "system"
  | "agent_joined"
  | "employer_registered"
  | "placement_completed"
  | "new_job_posted"
  | "target_assigned"
  | "target_updated"
  | "target_at_risk"
  | "target_milestone";

type TargetAssigneeRole = "agent" | "super_agent";

type CommissionRecipientRole = "agent" | "super_agent";

function getTargetManagementLink(role: TargetAssigneeRole, locale = "en"): string {
  const segment = role === "super_agent" ? "super-agent" : "agent";
  return `/${locale}/${segment}/target-management`;
}

function getCommissionLink(role: CommissionRecipientRole, locale = "en"): string {
  const segment = role === "super_agent" ? "super-agent" : "agent";
  return `/${locale}/${segment}/commissions`;
}

interface NotifyPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  sendEmail?: boolean;
  sendWhatsApp?: boolean;
  metadata?: Record<string, unknown>;
  /** Translation key (notificationContent namespace) for localized title. */
  titleKey?: string;
  /** Translation key (notificationContent namespace) for localized body. */
  bodyKey?: string;
  /** ICU params for the localized title/body keys. */
  params?: Record<string, unknown>;
}

export async function notify(payload: NotifyPayload): Promise<void> {
  await connectDB();

  // Merge localization keys into meta so the client can render bilingual text.
  const meta: Record<string, unknown> = { ...payload.metadata };
  if (payload.titleKey) meta.titleKey = payload.titleKey;
  if (payload.bodyKey) meta.bodyKey = payload.bodyKey;
  if (payload.params) meta.params = payload.params;

  // Always create an in-app notification synchronously (fast, no queue needed)
  await Notification.create({
    userId: payload.userId,
    type: payload.type,
    title: payload.title,
    body: payload.message,
    actionUrl: payload.link,
    meta,
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
    titleKey: "applicationReceivedTitle",
    bodyKey: "applicationReceivedBody",
    params: { jobTitle, companyName },
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
    titleKey: "statusUpdatedTitle",
    bodyKey: "statusUpdatedBody",
    params: { jobTitle, status },
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
    metadata: { jobTitle, scheduledAt, location, interviewId },
    titleKey: "interviewScheduledTitle",
    bodyKey: "interviewScheduledBody",
    params: { jobTitle, location, dateIso: scheduledAt.toISOString(), date: dateStr },
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
    titleKey: "interviewSelectedTitle",
    bodyKey: "interviewSelectedBody",
    params: { jobTitle, companyName },
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
    titleKey: "offerMadeTitle",
    bodyKey: "offerMadeBody",
    params: { jobTitle, companyName },
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
    titleKey: "rejectedTitle",
    bodyKey: "rejectedBody",
    params: { jobTitle },
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
    titleKey: "mentionTitle",
    bodyKey: "mentionBody",
    params: { authorName, candidateName },
  });
}

export async function notifyScorecardSubmitted(
  jobSeekerId: string,
  jobTitle: string,
  companyName: string,
  overallScore: number,
  applicationId: string
): Promise<void> {
  const scoreLabel =
    overallScore >= 4 ? "Excellent" : overallScore >= 3 ? "Good" : "Reviewed";
  const scoreLabelKey =
    overallScore >= 4 ? "scoreExcellent" : overallScore >= 3 ? "scoreGood" : "scoreReviewed";
  await notify({
    userId: jobSeekerId,
    type: "interview_update",
    title: "Interview Feedback Available",
    message: `Your interview for "${jobTitle}" at ${companyName} has been evaluated. Score: ${scoreLabel} (${overallScore.toFixed(1)}/5).`,
    link: `/en/job-seeker/applications`,
    sendEmail: true,
    metadata: { jobTitle, companyName, overallScore, applicationId },
    titleKey: "scorecardTitle",
    bodyKey: "scorecardBody",
    params: { jobTitle, companyName, score: overallScore.toFixed(1), scoreLabelKey },
  });
}

export async function notifyTargetAssigned(
  assigneeId: string,
  assigneeRole: TargetAssigneeRole,
  profileId: string,
  year: number,
  locale = "en"
): Promise<void> {
  await notify({
    userId: assigneeId,
    type: "target_assigned",
    title: "Target assigned",
    message: `Your ${year} target plan is ready. Review your employer, employee, and finance goals.`,
    link: getTargetManagementLink(assigneeRole, locale),
    sendEmail: false,
    metadata: { profileId, year, assigneeRole },
    titleKey: "targetAssignedTitle",
    bodyKey: "targetAssignedBody",
    params: { year: String(year) },
  });
}

export async function notifyTargetUpdated(
  assigneeId: string,
  assigneeRole: TargetAssigneeRole,
  profileId: string,
  year: number,
  locale = "en"
): Promise<void> {
  await notify({
    userId: assigneeId,
    type: "target_updated",
    title: "Target updated",
    message: `Your ${year} target plan has been updated. Check the latest allocation and monthly breakdown.`,
    link: getTargetManagementLink(assigneeRole, locale),
    sendEmail: false,
    metadata: { profileId, year, assigneeRole },
    titleKey: "targetUpdatedTitle",
    bodyKey: "targetUpdatedBody",
    params: { year: String(year) },
  });
}

export async function notifyTargetAtRisk(
  assigneeId: string,
  assigneeRole: TargetAssigneeRole,
  profileId: string,
  overallProgress: number,
  expectedProgress: number,
  locale = "en"
): Promise<void> {
  await notify({
    userId: assigneeId,
    type: "target_at_risk",
    title: "Target needs attention",
    message: `Current progress is ${overallProgress}% against an expected pace of ${expectedProgress}%.`,
    link: getTargetManagementLink(assigneeRole, locale),
    sendEmail: true,
    metadata: { profileId, overallProgress, expectedProgress, assigneeRole },
    titleKey: "targetAtRiskTitle",
    bodyKey: "targetAtRiskBody",
    params: { overallProgress: String(overallProgress), expectedProgress: String(expectedProgress) },
  });
}

export async function notifyTargetMilestone(
  assigneeId: string,
  assigneeRole: TargetAssigneeRole,
  profileId: string,
  tier: string,
  overallProgress: number,
  locale = "en"
): Promise<void> {
  await notify({
    userId: assigneeId,
    type: "target_milestone",
    title: "Target milestone reached",
    message: `You reached the ${tier} target tier at ${overallProgress}% overall progress.`,
    link: getTargetManagementLink(assigneeRole, locale),
    sendEmail: false,
    metadata: { profileId, tier, overallProgress, assigneeRole },
    titleKey: "targetMilestoneTitle",
    bodyKey: "targetMilestoneBody",
    params: { tier, overallProgress: String(overallProgress) },
  });
}

export async function notifyCommissionApproved(
  userId: string,
  role: CommissionRecipientRole,
  amount: number,
  currency: string,
  locale = "en",
): Promise<void> {
  await notify({
    userId,
    type: "payment",
    title: "Commission approved",
    message: `Your commission of ${currency} ${amount.toLocaleString()} has been approved for payout.`,
    link: getCommissionLink(role, locale),
    sendEmail: true,
    metadata: { amount, currency, role, status: "approved" },
    titleKey: "commissionApprovedTitle",
    bodyKey: "commissionApprovedBody",
    params: { currency, amount: amount.toLocaleString() },
  });
}

export async function notifyCommissionPaid(
  userId: string,
  role: CommissionRecipientRole,
  amount: number,
  currency: string,
  paymentRef: string,
  locale = "en",
): Promise<void> {
  await notify({
    userId,
    type: "payment",
    title: "Commission paid",
    message: `Your commission of ${currency} ${amount.toLocaleString()} has been paid. Reference: ${paymentRef}.`,
    link: getCommissionLink(role, locale),
    sendEmail: true,
    metadata: { amount, currency, paymentRef, role, status: "paid" },
    titleKey: "commissionPaidTitle",
    bodyKey: "commissionPaidBody",
    params: { currency, amount: amount.toLocaleString(), paymentRef },
  });
}

// ─── Super-agent helper: resolve userId from agentId ───
export async function getSuperAgentUserId(agentId: string): Promise<string | null> {
  const Agent = (await import("@/models/Agent")).default;
  const SuperAgent = (await import("@/models/SuperAgent")).default;
  const agentDoc = await Agent.findById(agentId).select("superAgentId").lean();
  if (!agentDoc?.superAgentId) return null;
  const saDoc = await SuperAgent.findById(agentDoc.superAgentId).select("userId").lean();
  return saDoc?.userId ? String(saDoc.userId) : null;
}

// ─── Super-agent notification helpers ───

export async function notifySuperAgentNewJob(
  superAgentUserId: string,
  employerName: string,
  jobTitle: string,
  jobId: string,
  locale = "en",
): Promise<void> {
  await notify({
    userId: superAgentUserId,
    type: "new_job_posted",
    title: "New Job Posted",
    message: `${employerName} posted a new job: "${jobTitle}".`,
    link: `/${locale}/super-agent/jobs`,
    sendEmail: false,
    metadata: { jobId, employerName, jobTitle },
    titleKey: "saNewJobTitle",
    bodyKey: "saNewJobBody",
    params: { employerName, jobTitle },
  });
}

export async function notifySuperAgentAgentJoined(
  superAgentUserId: string,
  agentName: string,
  agentUserId: string,
  locale = "en",
): Promise<void> {
  await notify({
    userId: superAgentUserId,
    type: "agent_joined",
    title: "New Agent Joined Your Team",
    message: `${agentName} has been added to your team.`,
    link: `/${locale}/super-agent/agents`,
    sendEmail: true,
    metadata: { agentUserId },
    titleKey: "saAgentJoinedTitle",
    bodyKey: "saAgentJoinedBody",
    params: { agentName },
  });
}

export async function notifySuperAgentEmployerRegistered(
  superAgentUserId: string,
  companyName: string,
  agentName: string,
  employerId: string,
  locale = "en",
): Promise<void> {
  await notify({
    userId: superAgentUserId,
    type: "employer_registered",
    title: "New Employer Registered",
    message: `${companyName} registered via ${agentName}'s referral.`,
    link: `/${locale}/super-agent/employers`,
    sendEmail: true,
    metadata: { companyName, employerId },
    titleKey: "saEmployerRegisteredTitle",
    bodyKey: "saEmployerRegisteredBody",
    params: { companyName, agentName },
  });
}

export async function notifySuperAgentPlacement(
  superAgentUserId: string,
  candidateName: string,
  jobTitle: string,
  companyName: string,
  placementId: string,
  locale = "en",
): Promise<void> {
  await notify({
    userId: superAgentUserId,
    type: "placement_completed",
    title: "New Placement Completed",
    message: `${candidateName} was placed as "${jobTitle}" at ${companyName}.`,
    link: `/${locale}/super-agent/placements`,
    sendEmail: true,
    metadata: { placementId, candidateName, jobTitle, companyName },
    titleKey: "saPlacementTitle",
    bodyKey: "saPlacementBody",
    params: { candidateName, jobTitle, companyName },
  });
}
