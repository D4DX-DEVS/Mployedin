/**
 * Admin's read-only performance report on one super agent or agent
 * (plan: "Admin Staff Performance Plan v2", owner decisions 2026-11-24).
 *
 * Client-safe: types only. The builder lives in `build.server.ts`.
 */

export type StaffKind = "agent" | "super_agent";

export type RangePreset = "this_month" | "last_month" | "last_90" | "this_year" | "all" | "custom";

export interface ReportRange {
  preset: RangePreset;
  /** ISO date (yyyy-mm-dd) or null for "all time". */
  from: string | null;
  /** ISO date (yyyy-mm-dd), inclusive. */
  to: string;
}

export interface Money {
  currency: string;
  amount: number;
}

export interface MoneyByStatus {
  currency: string;
  pending: number;
  approved: number;
  paid: number;
  disputed: number;
  /** pending + approved + paid + disputed; clawed-back lines are left out. */
  total: number;
  count: number;
}

export type GapSeverity = "high" | "medium" | "low";

export interface ReportGap {
  key: string;
  severity: GapSeverity;
  /** The count or value the message is about, when there is one. */
  value?: number;
}

/** Working = real work in the last 30 days; Idle = login on, no work; Inactive = login off. */
export type WorkState = "working" | "idle" | "inactive";

export interface StaffIdentity {
  userId: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  archived: boolean;
  createdAt?: string;
  lastLogin?: string | null;
  regions: string[];
  country?: string;
  currencyCode?: string;
  referralCode?: string;
}

export interface TargetMeasure {
  target: number;
  actual: number;
  /** 0-999, null when that measure has no target. */
  progress: number | null;
}

export interface TargetSummary {
  profileId: string;
  year: number;
  currency: string;
  /** Share of the year's target due by today (0-100). */
  expectedProgress: number;
  /** Combined progress, each part capped at 100. */
  overallProgress: number;
  risk: "high" | "medium" | "low";
  kind: "kpi3" | "profit";
  jobs?: TargetMeasure;
  onboarded?: TargetMeasure;
  revenue?: TargetMeasure;
  profit?: TargetMeasure;
}

export interface ReportTiles {
  jobs: { posted: number; active: number; closed: number };
  applications: number;
  hires: { hired: number; placements: number };
  /** Only for agents: application status changes they made in the range. */
  candidatesMoved?: number;
  invoices: { count: number; totals: Money[] };
  /** Outstanding today on issued invoices (not limited to the range). */
  receivables: { due: Money[]; overdue: Money[]; overdueCount: number };
  subscriptions: { active: number; employers: number };
  exhibitions: { total: number; byStatus: Record<string, number> };
  /** Only for super agents. */
  workingAgents?: { working: number; total: number };
  commission: { owed: Money[]; paid: Money[] };
}

export interface TeamAgentRow {
  userId: string;
  name: string;
  email: string;
  state: WorkState;
  lastActivity: string | null;
  regions: string;
  employers: number;
  jobsPosted: number;
  candidatesMoved: number;
  hires: number;
  commissionOwed: Money[];
  openTasks: number;
  overdueTasks: number;
}

export interface EmployerRow {
  id: string;
  companyName: string;
  agentName: string;
  isActive: boolean;
  jobs: number;
  activeJobs: number;
  applications: number;
  hires: number;
  plan: string | null;
  planStatus: string | null;
  renewsAt: string | null;
}

export interface JobRow {
  id: string;
  title: string;
  employerName: string;
  agentName: string;
  status: string;
  applications: number;
  hires: number;
  createdAt?: string;
}

export interface InvoiceRow {
  id: string;
  number: string;
  employerName: string;
  agentName: string;
  issuedAt?: string;
  dueDate?: string;
  amount: number;
  paid: number;
  balance: number;
  currency: string;
  status: string;
  overdue: boolean;
}

export interface ExhibitionRow {
  id: string;
  name: string;
  agentName: string;
  location: string;
  startDate?: string;
  endDate?: string;
  status: string;
  budget: number;
  currency: string;
}

export interface CommissionRow {
  id: string;
  earnedBy: string;
  earner: StaffKind;
  type: string;
  amount: number;
  currency: string;
  status: string;
  createdAt?: string;
}

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  /** "to" = given to this person; "by" = this person gave it to someone. */
  direction: "to" | "by";
  otherPerson: string;
  overdue: boolean;
}

export interface SeekerRow {
  id: string;
  name: string;
  how: "referred" | "assigned";
  createdAt?: string;
}

export interface ActivityRow {
  action: string;
  targetType?: string;
  at: string;
}

/** A capped table: `rows` plus how many there were in all. */
export interface Capped<T> {
  rows: T[];
  total: number;
}

export interface StaffReport {
  kind: StaffKind;
  range: ReportRange;
  generatedAt: string;
  identity: StaffIdentity;
  state: WorkState;
  lastActivity: string | null;
  /** Agent: their commission %; super agent: override %. */
  rate: number;
  /** Super agents only: default commission for their agents. */
  defaultAgentRate?: number;
  /** Agents only: the super agent they report to. */
  superAgent?: { userId: string; name: string } | null;
  tiles: ReportTiles;
  /** Applications on in-scope jobs created in the range, by status. */
  funnel: Record<string, number>;
  target: TargetSummary | null;
  gaps: ReportGap[];
  team?: TeamAgentRow[];
  employers: Capped<EmployerRow>;
  jobs: Capped<JobRow>;
  invoices: Capped<InvoiceRow>;
  exhibitions: Capped<ExhibitionRow>;
  commission: {
    lines: Capped<CommissionRow>;
    own: MoneyByStatus[];
    /** Super agents only: what their agents earned. */
    team: MoneyByStatus[];
    combined: MoneyByStatus[];
  };
  tasks: { open: number; overdue: number; rows: Capped<TaskRow> };
  /** Agents only. */
  seekers?: Capped<SeekerRow>;
  activity?: ActivityRow[];
}

/** One row of the Super Agents / Agents list's extra columns. */
export interface StaffListSignal {
  userId: string;
  warnings: number;
  state: WorkState;
  lastActivity: string | null;
  /** Super agents only. */
  workingAgents?: { working: number; total: number };
}
