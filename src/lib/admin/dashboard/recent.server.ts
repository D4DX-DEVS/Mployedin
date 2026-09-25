import Application from "@/models/Application";
import AuditLog from "@/models/AuditLog";
import Interview from "@/models/Interview";
import Invoice from "@/models/Invoice";
import Job from "@/models/Job";
import Placement from "@/models/Placement";
import Subscription from "@/models/Subscription";
import User from "@/models/User";
import type { RecentEvent, RecentEventCategory } from "./types";

/** Each category gets its own latest few, so a filter tab is never empty just because another category was busier. */
const PER_SOURCE = 6;

/**
 * Admin and security actions from the audit log. Sign-in successes, reads and
 * the per-user noise (profile edits, chat) stay out; this is what an admin
 * would want to know someone did.
 */
export const SYSTEM_ACTIONS = [
  "settings.update",
  "user.create",
  "user.delete",
  "user.deactivate",
  "impersonation.start",
  "gdpr.export",
] as const;

/** Legacy rows can lack a usable date; one of them used to blank the whole list. */
function iso(value: Date | string | undefined | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type Dated = { _id: unknown; createdAt?: Date };
type Candidate = Omit<RecentEvent, "at"> & { at: string | null };

/**
 * One feed for the whole platform, filtered in the browser by category.
 * `categories` is the set the admin may read; the rest are never queried.
 */
export async function getRecentEvents(categories: ReadonlySet<RecentEventCategory>): Promise<RecentEvent[]> {
  const want = (category: RecentEventCategory) => categories.has(category);
  const none = Promise.resolve([] as never[]);

  const [users, jobs, applications, interviews, placements, invoicesIssued, invoicesPaid, subscriptions, audits] = await Promise.all([
    want("users")
      ? User.find({}).sort({ createdAt: -1 }).limit(PER_SOURCE).select("name role createdAt").lean<(Dated & { name?: string; role?: string })[]>()
      : none,
    want("jobs")
      ? Job.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(PER_SOURCE).select("title status createdAt").lean<(Dated & { title?: string; status?: string })[]>()
      : none,
    want("applications")
      ? Application.find({})
          .sort({ appliedAt: -1 })
          .limit(PER_SOURCE)
          .select("status appliedAt createdAt jobId jobSeekerId")
          .populate("jobId", "title")
          .populate("jobSeekerId", "fullName")
          .lean<
            (Dated & {
              status?: string;
              appliedAt?: Date;
              jobId?: { title?: string } | null;
              jobSeekerId?: { fullName?: string } | null;
            })[]
          >()
      : none,
    want("applications")
      ? Interview.find({}).sort({ createdAt: -1 }).limit(PER_SOURCE).select("createdAt jobId").populate("jobId", "title").lean<(Dated & { jobId?: { title?: string } | null })[]>()
      : none,
    want("applications")
      ? Placement.find({}).sort({ createdAt: -1 }).limit(PER_SOURCE).select("createdAt jobId").populate("jobId", "title").lean<(Dated & { jobId?: { title?: string } | null })[]>()
      : none,
    want("finance")
      ? Invoice.find({ issuedAt: { $ne: null } }).sort({ issuedAt: -1 }).limit(PER_SOURCE).select("invoiceNumber issuedAt").lean<(Dated & { invoiceNumber?: string; issuedAt?: Date })[]>()
      : none,
    want("finance")
      ? Invoice.find({ paidAt: { $ne: null } }).sort({ paidAt: -1 }).limit(PER_SOURCE).select("invoiceNumber paidAt").lean<(Dated & { invoiceNumber?: string; paidAt?: Date })[]>()
      : none,
    want("finance")
      ? Subscription.find({}).sort({ createdAt: -1 }).limit(PER_SOURCE).select("planSnapshot.name createdAt").lean<(Dated & { planSnapshot?: { name?: string } })[]>()
      : none,
    want("system")
      ? AuditLog.find({ action: { $in: [...SYSTEM_ACTIONS] } })
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE)
          .select("action actorId createdAt")
          .populate("actorId", "name")
          .lean<(Dated & { action: string; actorId?: { name?: string } | null })[]>()
      : none,
  ]);

  const candidates: Candidate[] = [
    ...users.map((user) => ({ id: `user-${String(user._id)}`, kind: "user" as const, category: "users" as const, subject: user.name ?? "", role: user.role, at: iso(user.createdAt) })),
    ...jobs.map((job) => ({ id: `job-${String(job._id)}`, kind: "job" as const, category: "jobs" as const, subject: job.title ?? "", status: job.status, at: iso(job.createdAt) })),
    ...applications.map((application) => {
      // "Name · Job title" so six rows at the same timestamp are distinguishable; titleFor appends it.
      const name = application.jobSeekerId?.fullName?.trim() ?? "";
      const job = application.jobId?.title?.trim() ?? "";
      const subject = name && job ? `${name} · ${job}` : name || job;
      return {
        id: `application-${String(application._id)}`,
        kind: "application" as const,
        category: "applications" as const,
        subject,
        status: application.status,
        at: iso(application.appliedAt ?? application.createdAt),
      };
    }),
    ...interviews.map((interview) => ({
      id: `interview-${String(interview._id)}`,
      kind: "interview" as const,
      category: "applications" as const,
      subject: interview.jobId?.title ?? "",
      at: iso(interview.createdAt),
    })),
    ...placements.map((placement) => ({
      id: `placement-${String(placement._id)}`,
      kind: "placement" as const,
      category: "applications" as const,
      subject: placement.jobId?.title ?? "",
      at: iso(placement.createdAt),
    })),
    ...invoicesIssued.map((invoice) => ({
      id: `invoice-issued-${String(invoice._id)}`,
      kind: "invoice_issued" as const,
      category: "finance" as const,
      subject: invoice.invoiceNumber ?? "",
      at: iso(invoice.issuedAt),
    })),
    ...invoicesPaid.map((invoice) => ({
      id: `invoice-paid-${String(invoice._id)}`,
      kind: "invoice_paid" as const,
      category: "finance" as const,
      subject: invoice.invoiceNumber ?? "",
      at: iso(invoice.paidAt),
    })),
    ...subscriptions.map((subscription) => ({
      id: `subscription-${String(subscription._id)}`,
      kind: "subscription_started" as const,
      category: "finance" as const,
      subject: subscription.planSnapshot?.name ?? "",
      at: iso(subscription.createdAt),
    })),
    ...audits.map((entry) => ({
      id: `audit-${String(entry._id)}`,
      kind: "system" as const,
      category: "system" as const,
      subject: entry.actorId?.name ?? "",
      action: entry.action,
      at: iso(entry.createdAt),
    })),
  ];

  return candidates
    .filter((event): event is RecentEvent => event.at !== null)
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}
