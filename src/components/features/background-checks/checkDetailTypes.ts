/** The detail payload both GET /api/employer/background-checks/[id] and GET /api/background-checks/[id] return. */

export type CheckStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type CheckOutcome = "clear" | "flagged" | "failed" | "unable_to_verify" | "pending";
export type ReferenceStatus = "pending" | "requested" | "responded" | "declined";
export type CheckType = "background" | "reference" | "both";

export const CHECK_STATUSES: readonly CheckStatus[] = ["pending", "in_progress", "completed", "cancelled"];
export const CHECK_OUTCOMES: readonly CheckOutcome[] = ["clear", "flagged", "failed", "unable_to_verify", "pending"];
export const FINAL_OUTCOMES: readonly Exclude<CheckOutcome, "pending">[] = ["clear", "flagged", "failed", "unable_to_verify"];
export const CHECK_TYPES: readonly CheckType[] = ["background", "reference", "both"];

export interface CheckPersonRef {
  _id: string;
  name?: string;
  email?: string;
  role?: string;
}

export interface CheckReference {
  name: string;
  relationship?: string;
  company?: string;
  email?: string;
  phone?: string;
  status: ReferenceStatus;
  feedback?: string;
  respondedAt?: string;
}

export interface CheckRecord {
  _id: string;
  checkType: CheckType;
  status: CheckStatus;
  outcome: CheckOutcome;
  references: CheckReference[];
  /** Employer side only — never sent to staff. */
  backgroundNotes?: string;
  backgroundResults?: string;
  requestedAt?: string;
  createdAt?: string;
  completedAt?: string;
  verifiedAt?: string;
  jobSeekerId?: { fullName?: string; userId?: { name?: string } | null } | null;
  jobId?: { _id?: string; title?: string } | null;
  employerId?: { _id?: string; companyName?: string } | null;
  applicationId?: { _id?: string; status?: string } | null;
  assignedTo?: CheckPersonRef | null;
  verifiedBy?: CheckPersonRef | null;
  createdBy?: CheckPersonRef | null;
}

export interface CheckHistoryEntry {
  id: string;
  action: string;
  at: string;
  actor: { name: string; kind: "agent" | "employer" | "staff" | "system" };
  meta: Record<string, unknown>;
}

export interface CheckViewer {
  canStart: boolean;
  canWork: boolean;
  canAssign: boolean;
  canCancel: boolean;
  canEditNotes: boolean;
  heldByOther: boolean;
}

export interface CheckAssignee {
  _id: string;
  name: string;
  kind: "colleague" | "agent";
}

export interface CheckDetailPayload {
  check: CheckRecord;
  history: CheckHistoryEntry[];
  startedAt: string | null;
  viewer: CheckViewer;
  assignable: CheckAssignee[];
}

/** Error codes the check routes answer with; each has copy under backgroundCheckWork.errors. */
export const KNOWN_ERROR_CODES = [
  "held_by_other",
  "closed",
  "not_started",
  "changed",
  "needs_outcome",
  "needs_summary",
  "needs_reply",
  "not_assignable",
  "reference_not_found",
  "forbidden",
] as const;

export const candidateNameOf = (check: Pick<CheckRecord, "jobSeekerId">): string =>
  check.jobSeekerId?.fullName || check.jobSeekerId?.userId?.name || "";

export const personName = (person?: CheckPersonRef | null): string => person?.name || person?.email || "";

/** Agents are named as such; anybody else on a check is the employer's team. */
export const personKind = (person?: CheckPersonRef | null): "agent" | "team" =>
  person?.role === "agent" ? "agent" : "team";
