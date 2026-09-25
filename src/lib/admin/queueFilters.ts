/**
 * Filters shared by the admin dashboard's queue counts and the list endpoints
 * its rows link to (`/api/invoices?attention=`, `/api/admin/subscriptions?expiring=`,
 * `/api/admin/action-counts`). One definition per row, so the count on the
 * dashboard is the number of rows the admin lands on.
 *
 * No model imports: API routes pull this in without the dashboard's queries.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Invoices with an employer "I paid" notice nobody has decided yet. Approve and reject both stamp `verifiedAt`. */
export const PAYMENT_NOTICE_PENDING_FILTER = {
  paymentNotifications: { $elemMatch: { verifiedAt: null } },
};

/** Invoices with a billing dispute still open. */
export const INVOICE_DISPUTE_OPEN_FILTER = {
  disputes: { $elemMatch: { status: { $in: ["open", "under_review"] } } },
};

/** Customer-care conversations not yet resolved. */
export const OPEN_SUPPORT_TICKET_FILTER = {
  type: "customer_care" as const,
  "customerCare.status": { $in: ["open", "assigned"] as ("open" | "assigned")[] },
};

/** `expiring=` values the subscriptions list accepts, in days. */
export const SUBSCRIPTION_EXPIRING_WINDOWS: Record<string, number> = { "7d": 7, "30d": 30 };

/** Active subscriptions whose paid period ends within `days`. */
export function subscriptionsEndingFilter(days: number, now: Date = new Date()) {
  return { status: "active", endDate: { $gte: now, $lte: new Date(now.getTime() + days * DAY_MS) } };
}

/** `expiring=` values the admin jobs list accepts, in days. */
export const JOB_EXPIRING_WINDOWS: Record<string, number> = { "7d": 7 };

/** Active jobs whose listing closes within `days`. */
export function jobsExpiringFilter(days: number, now: Date = new Date()) {
  return { status: "active", deletedAt: null, expiresAt: { $gte: now, $lte: new Date(now.getTime() + days * DAY_MS) } };
}
