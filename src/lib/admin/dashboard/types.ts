import type { ApplicationStatus } from "@/models/Application";

/**
 * Shapes the admin dashboard renders. Every figure is counted from a stored
 * field — nothing here is estimated, sampled or defaulted to a reassuring
 * value — and each metric has one home: the action queue holds counts of
 * things to act on, the sections below hold context the queue does not.
 */

export interface WindowedCount {
  /** Count inside the selected period. */
  current: number;
  /** Count inside the equally long period before it. */
  previous: number;
}

/** A platform total plus how many were added in the period (and the one before). */
export interface SnapshotMetric {
  total: number;
  added: WindowedCount;
}

export interface PlatformSnapshot {
  users: SnapshotMetric;
  /** Total = active right now; added = jobs created in the period, drafts included. */
  activeJobs: SnapshotMetric;
  applications: SnapshotMetric;
  /** Total = every interview; added = interviews scheduled (created) in the period. */
  interviews: SnapshotMetric;
  placements: SnapshotMetric;
}

export interface PipelineStage {
  status: ApplicationStatus;
  /** Applications currently at this status (not "ever reached"). */
  count: number;
}

/**
 * Stage conversion over every application to date. "Reached" means the
 * status history — or the current status — shows the application got at least
 * that far, so a rejected-after-interview application still counts as having
 * reached interview.
 */
export interface HiringFunnel {
  applications: number;
  reachedInterview: number;
  reachedOffer: number;
  hired: number;
  /** Mean hours from applying to the first status change; null when none has moved. */
  avgHoursToFirstReview: number | null;
  /** Mean days from applying to hired; null when nobody was hired with a dated history. */
  avgDaysToHire: number | null;
}

/** Active jobs by what needs doing. "No applications" lives in the action queue only. */
export interface JobHealth {
  activeJobs: number;
  /** Active jobs with one or two applications. */
  lowVolume: number;
  /** Active jobs whose `expiresAt` falls in the next 7 days. */
  expiringSoon: number;
  paused: number;
  drafts: number;
  /** Jobs with status expired whose `expiresAt` fell inside the period. */
  expiredInPeriod: number;
}

export interface RecruitmentOverview {
  pipeline: PipelineStage[];
  jobs: JobHealth;
  funnel: HiringFunnel;
}

export type UserRoleBucket = "job_seeker" | "employer" | "agent" | "super_agent" | "other";

export interface EmployerHealth {
  /** Company profiles (Employer documents), not user accounts. */
  companies: number;
  /** Employer user accounts (a company can have several). */
  accounts: number;
  /** Active employer accounts signed in within the last 7 days. */
  accountsActive7d: number;
  /** Active employer accounts with no sign-in for 7+ days. */
  accountsInactive7d: number;
  newCompaniesInPeriod: number;
  withoutActiveJob: number;
  /** Companies that have active jobs, none of which has an application. */
  activeJobsButNoApplications: number;
}

export interface AgentOperations {
  activeAgents: number;
  signedInThisWeek: number;
  notSignedInThisWeek: number;
  /** This year's active target profiles (agents + super agents) by pace. */
  targets: { behind: number; onPace: number; achieved: number };
  /** Job seekers registered through an agent referral inside the period. */
  candidatesSourced: number;
  /** Interviews with an agent attached, scheduled inside the period. */
  interviewsArranged: number;
  /** Placements credited to an agent, inside the period. */
  placements: number;
}

export interface PeopleOverview {
  usersByRole: { role: UserRoleBucket; count: number }[];
  employers: EmployerHealth | null;
  agents: AgentOperations | null;
}

export interface MoneyByCurrency {
  currency: string;
  /** Balance still due on issued, sent, partially paid and overdue invoices. */
  outstanding: number;
  /** The part of `outstanding` on invoices marked overdue. */
  overdue: number;
  /** Payments recorded inside the period on revenue invoices. */
  collected: number;
}

/** Money side of payments and commissions; the action queue holds the counts. */
export interface PaymentsMoney {
  currency: string;
  /** Balance due on invoices with an unverified "I paid" notice. */
  awaitingVerification: number;
  commissionPending: number;
  /** Approved commission not yet paid out. */
  commissionApproved: number;
  commissionDisputed: number;
  /** Commission paid out inside the period. */
  commissionPaid: number;
}

export interface SubscriptionPlanCount {
  role: "employer" | "job_seeker";
  name: string;
  tier: number;
  count: number;
}

export interface FinanceOverview {
  money: MoneyByCurrency[];
  invoiceStatuses: { status: string; count: number }[];
  totalInvoices: number;
  openDisputes: number;
  activeSubscriptions: number;
  plans: SubscriptionPlanCount[];
  expiredInPeriod: number;
  cancelledInPeriod: number;
  /** Null when the admin may not read commissions. */
  payments: PaymentsMoney[] | null;
}

export type HealthStatus = "healthy" | "warning" | "critical";

export type HealthCheckId = "database" | "email" | "webhooks" | "authentication";

export interface HealthCheck {
  id: HealthCheckId;
  status: HealthStatus;
  /** The measured value: ms for the database, a count otherwise. */
  value: number;
  /** Second measured value where one check has two (failed sign-ins for authentication). */
  secondary?: number;
  /** Where the admin fixes it; null when no page lists these rows. */
  path: string | null;
}

export type RecentEventCategory = "users" | "jobs" | "applications" | "finance" | "system";

export type RecentEventKind =
  | "user"
  | "job"
  | "application"
  | "interview"
  | "placement"
  | "invoice_issued"
  | "invoice_paid"
  | "subscription_started"
  | "system";

export interface RecentEvent {
  id: string;
  kind: RecentEventKind;
  category: RecentEventCategory;
  /** Name, job title, invoice number or plan the title interpolates; empty when none. */
  subject: string;
  role?: string;
  status?: string;
  /** Audit action for system events, e.g. "settings.update". */
  action?: string;
  at: string;
}
