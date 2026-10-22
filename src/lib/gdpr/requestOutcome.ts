/**
 * What the team records on a data-subject request: what was done, why a
 * request was refused or only partly done, and internal notes.
 *
 * Plain constants only (no mongoose), so the admin form can share the limits
 * with the model and the API validator without pulling the model client-side.
 */

/** Longest text each field takes. GdprRequest and adminGdprStatusSchema both use these. */
export const OUTCOME_MAX = 1000;
export const OUTCOME_REASON_MAX = 1000;
export const ADMIN_NOTES_MAX = 2000;

/** The statuses an admin can finish a request with. */
export type GdprDecision = "completed" | "rejected";

/** The three fields as an admin sends them; each is left out when empty. */
export interface GdprOutcomeFields {
  outcome?: string;
  outcomeReason?: string;
  adminNotes?: string;
}

/** Trims each field and keeps only those with text, so nothing blank is stored. */
export function pickOutcomeFields(input: GdprOutcomeFields): GdprOutcomeFields {
  const picked: GdprOutcomeFields = {};
  for (const key of ["outcome", "outcomeReason", "adminNotes"] as const) {
    const value = input[key]?.trim();
    if (value) picked[key] = value;
  }
  return picked;
}

/**
 * What an audit entry may say about them: the outcome text and reason, but only
 * that internal notes were set. The audit log is immutable, so the notes
 * themselves stay in the register where they can be corrected.
 */
export function outcomeAuditFields(fields: GdprOutcomeFields): Record<string, unknown> {
  return {
    ...(fields.outcome ? { outcome: fields.outcome } : {}),
    ...(fields.outcomeReason ? { outcomeReason: fields.outcomeReason } : {}),
    ...(fields.adminNotes ? { adminNotesSet: true } : {}),
  };
}
