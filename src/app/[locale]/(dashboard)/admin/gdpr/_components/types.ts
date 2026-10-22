/** Mirrors GdprRequestType / GdprRequestStatus; the model file cannot be imported client-side. */
export type GdprRequestType = "export" | "delete" | "rectification" | "restrict";
export type GdprRequestStatus = "pending" | "in_progress" | "completed" | "rejected" | "cancelled";

/** One row of GET /api/admin/gdpr/consent (Other consents). No IP address: the API no longer sends one. */
export interface ConsentRow {
  _id: string;
  userName: string;
  userEmail?: string | null;
  consentType: string;
  granted: boolean;
  timestamp: string;
  source?: string | null;
  /** The Terms/Privacy version a terms_and_privacy row accepted. */
  policyVersion?: string | null;
}

/** One row of GET /api/admin/gdpr. */
export interface GdprRequestRow {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestType: GdprRequestType;
  status: GdprRequestStatus;
  createdAt: string;
  completedAt?: string;
  /** On a deletion request, the reason the user typed (optional for them). Never written by an admin. */
  notes?: string;
  /** What the team did. */
  outcome?: string;
  /** Why the request was refused, or what was not done and why. The user is shown this. */
  outcomeReason?: string;
  /** Internal only; the user never sees it. */
  adminNotes?: string;
  /** The admin who last moved the request; null while nobody has. */
  handledByName?: string | null;
}
