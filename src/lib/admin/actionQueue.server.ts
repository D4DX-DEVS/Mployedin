import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import type { Resource } from "@/types/user";
import Commission from "@/models/Commission";
import CompanyReview from "@/models/CompanyReview";
import ContactSubmission from "@/models/ContactSubmission";
import Conversation from "@/models/Conversation";
import ExhibitionRequest from "@/models/ExhibitionRequest";
import GdprRequest from "@/models/GdprRequest";
import Invoice from "@/models/Invoice";
import Subscription from "@/models/Subscription";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import { ADMIN_QUEUE, buildAdminQueue, type AdminQueueId, type AdminQueueItem } from "./actionQueue";
import { getJobDemandBuckets } from "./dashboard/shared.server";
import { countApplicationsAwaitingReview } from "./platformAlerts.server";
import {
  INVOICE_DISPUTE_OPEN_FILTER,
  OPEN_SUPPORT_TICKET_FILTER,
  PAYMENT_NOTICE_PENDING_FILTER,
  subscriptionsEndingFilter,
} from "./queueFilters";

type Counter = () => Promise<number>;

const COUNTERS: Record<AdminQueueId, Counter> = {
  "exhibitions-submitted": () => ExhibitionRequest.countDocuments({ status: "submitted" }),
  "exhibitions-under-review": () => ExhibitionRequest.countDocuments({ status: "under_review" }),
  "exhibitions-budget": () => ExhibitionRequest.countDocuments({ status: "approved" }),
  "invoices-pending-approval": () => Invoice.countDocuments({ status: "pending_approval" }),
  "commissions-pending": () => Commission.countDocuments({ status: "pending" }),
  "company-reviews-pending": () => CompanyReview.countDocuments({ status: "pending" }),
  "default-plans-missing": async () => {
    const roles = await SubscriptionPlan.distinct("targetRole", { isActive: true, isDefault: true, targetRole: { $in: ["employer", "job_seeker"] } });
    return 2 - roles.length;
  },
  "gdpr-pending": () => GdprRequest.countDocuments({ status: "pending" }),
  "invoices-overdue": () => Invoice.countDocuments({ status: "overdue" }),
  "payment-notices": () => Invoice.countDocuments(PAYMENT_NOTICE_PENDING_FILTER),
  "invoice-disputes": () => Invoice.countDocuments(INVOICE_DISPUTE_OPEN_FILTER),
  "commissions-disputed": () => Commission.countDocuments({ status: "disputed" }),
  "subscriptions-ending": () => Subscription.countDocuments(subscriptionsEndingFilter(7)),
  "support-tickets": () => Conversation.countDocuments(OPEN_SUPPORT_TICKET_FILTER),
  "contact-unread": () => ContactSubmission.countDocuments({ isRead: false }),
  "applications-awaiting-review": () => countApplicationsAwaitingReview(),
  // Shares one aggregate with the Job health card's "low volume" row.
  "jobs-without-applications": async () => (await getJobDemandBuckets()).none,
};

/**
 * Counts every queue row the admin may open and returns the non-empty ones.
 * Rows for resources the admin cannot read are never queried, so a narrowed
 * custom-permission admin neither sees nor pays for them. A counter that fails
 * drops its row rather than blanking the dashboard.
 */
export async function getAdminActionQueue(can: (resource: Resource) => boolean): Promise<AdminQueueItem[]> {
  await connectDB();
  const permitted = ADMIN_QUEUE.filter((definition) => can(definition.resource));
  const results = await Promise.allSettled(permitted.map((definition) => COUNTERS[definition.id]()));

  const counts: Partial<Record<AdminQueueId, number>> = {};
  permitted.forEach((definition, index) => {
    const result = results[index];
    if (result.status === "fulfilled") counts[definition.id] = result.value;
    else logger.warn({ err: result.reason, queueId: definition.id }, "[adminActionQueue] counter failed");
  });
  return buildAdminQueue(counts);
}
