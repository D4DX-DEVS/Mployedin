import type { Resource } from "@/types/user";

/**
 * What is waiting on an admin, as one ordered list.
 *
 * The dashboard's "needs attention" card used to be recruitment-only: it could
 * say "92 jobs have no applications" while an exhibition sat awaiting the
 * admin's final decision, an employer's "I paid" notice waited for
 * verification and a GDPR request ran down its legal clock — none of which the
 * page mentioned. Every row here is something only an admin can move, counted
 * from the same filter the destination list applies, so the number on the
 * dashboard is the number of rows the admin lands on.
 *
 * Kept free of database imports (see `actionQueue.server.ts`) so the ranking
 * and the link table can be unit-tested without Mongoose.
 */

export type AdminQueueGroup = "decisions" | "finance" | "compliance" | "recruitment";

/**
 * critical — money or a legal clock is at stake; warning — needs a decision or
 * intervention; upcoming — worth handling soon, nothing is broken yet.
 */
export type AdminQueueLevel = "critical" | "warning" | "upcoming";

export type AdminQueueId =
  | "exhibitions-submitted"
  | "exhibitions-under-review"
  | "exhibitions-budget"
  | "invoices-pending-approval"
  | "commissions-pending"
  | "company-reviews-pending"
  | "default-plans-missing"
  | "gdpr-pending"
  | "invoices-overdue"
  | "payment-notices"
  | "invoice-disputes"
  | "commissions-disputed"
  | "subscriptions-ending"
  | "support-tickets"
  | "contact-unread"
  | "applications-awaiting-review"
  | "jobs-without-applications";

export interface AdminQueueDefinition {
  id: AdminQueueId;
  group: AdminQueueGroup;
  /** Read permission the destination list itself requires. */
  resource: Resource;
  /** Locale-less path; the filter in it is the one the count applies. */
  path: string;
  level: AdminQueueLevel;
}

/** Render order: groups in this order, rows in this order within a group. */
export const ADMIN_QUEUE_GROUPS: readonly AdminQueueGroup[] = ["decisions", "finance", "compliance", "recruitment"];

export const ADMIN_QUEUE: readonly AdminQueueDefinition[] = [
  // Decisions only an admin can take.
  { id: "exhibitions-submitted", group: "decisions", resource: "exhibitions", path: "/admin/exhibitions?status=submitted", level: "warning" },
  { id: "exhibitions-under-review", group: "decisions", resource: "exhibitions", path: "/admin/exhibitions?status=under_review", level: "warning" },
  // `approved` = cleared by review, waiting on the admin-only budget sign-off.
  { id: "exhibitions-budget", group: "decisions", resource: "exhibitions", path: "/admin/exhibitions?status=approved", level: "warning" },
  { id: "invoices-pending-approval", group: "decisions", resource: "invoices", path: "/admin/invoices?status=pending_approval", level: "warning" },
  { id: "commissions-pending", group: "decisions", resource: "commissions", path: "/admin/commissions?status=pending", level: "warning" },
  // Reviews are keyed to a company, so moderation rides the employers permission.
  { id: "company-reviews-pending", group: "decisions", resource: "employers", path: "/admin/cms/company-reviews?status=pending", level: "warning" },
  // With no default plan, new sign-ups of that role get no plan at all.
  { id: "default-plans-missing", group: "decisions", resource: "subscriptions", path: "/admin/subscription-plans", level: "critical" },

  // Money owed, claimed or contested.
  { id: "invoices-overdue", group: "finance", resource: "invoices", path: "/admin/invoices?status=overdue", level: "critical" },
  { id: "invoice-disputes", group: "finance", resource: "invoices", path: "/admin/invoices?attention=dispute", level: "critical" },
  { id: "commissions-disputed", group: "finance", resource: "commissions", path: "/admin/commissions?status=disputed", level: "critical" },
  { id: "payment-notices", group: "finance", resource: "invoices", path: "/admin/invoices?attention=payment_notice", level: "warning" },
  { id: "subscriptions-ending", group: "finance", resource: "subscriptions", path: "/admin/subscriptions?expiring=7d", level: "upcoming" },

  // Legal clocks and people waiting on a reply.
  // Data-subject requests carry a statutory one-month deadline.
  { id: "gdpr-pending", group: "compliance", resource: "audit_logs", path: "/admin/gdpr?status=pending", level: "critical" },
  { id: "support-tickets", group: "compliance", resource: "users", path: "/admin/messages?tab=support", level: "upcoming" },
  { id: "contact-unread", group: "compliance", resource: "contact_submissions", path: "/admin/cms/contact-submissions?status=unread", level: "upcoming" },

  // Hiring that has stalled.
  { id: "applications-awaiting-review", group: "recruitment", resource: "applications", path: "/admin/applications?stale=true", level: "warning" },
  { id: "jobs-without-applications", group: "recruitment", resource: "jobs", path: "/admin/jobs?applications=none&status=active", level: "warning" },
];

export interface AdminQueueItem extends AdminQueueDefinition {
  count: number;
}

export type AdminQueueCounts = Partial<Record<AdminQueueId, number>>;

/**
 * Rows with something waiting, in render order. A missing count means the
 * admin may not read that resource (or it was not queried) and the row is
 * dropped; a zero means nothing is waiting and the row is dropped too, so an
 * empty result is a genuine "all clear".
 */
export function buildAdminQueue(counts: AdminQueueCounts): AdminQueueItem[] {
  return ADMIN_QUEUE.flatMap((definition) => {
    const count = counts[definition.id];
    return typeof count === "number" && count > 0 ? [{ ...definition, count }] : [];
  });
}

/** Queue rows grouped for rendering, empty groups omitted. */
export function groupAdminQueue(items: readonly AdminQueueItem[]): { group: AdminQueueGroup; items: AdminQueueItem[] }[] {
  return ADMIN_QUEUE_GROUPS.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter(
    (entry) => entry.items.length > 0,
  );
}

/**
 * Groups the admin has at least one readable row in. A group outside this set
 * is hidden rather than shown as "nothing waiting", which would be untrue for
 * an admin who simply cannot see it.
 */
export function permittedQueueGroups(can: (resource: Resource) => boolean): AdminQueueGroup[] {
  return ADMIN_QUEUE_GROUPS.filter((group) =>
    ADMIN_QUEUE.some((definition) => definition.group === group && can(definition.resource)),
  );
}
