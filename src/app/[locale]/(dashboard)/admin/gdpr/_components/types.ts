/** Mirrors GdprRequestType / GdprRequestStatus; the model file cannot be imported client-side. */
export type GdprRequestType = "export" | "delete" | "rectification" | "restrict";
export type GdprRequestStatus = "pending" | "in_progress" | "completed" | "rejected" | "cancelled";

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
  /** On a deletion request, the reason the user typed (optional for them). */
  notes?: string;
  /** The admin who last moved the request; null while nobody has. */
  handledByName?: string | null;
}
