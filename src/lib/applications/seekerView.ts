/**
 * What a job seeker may see of their own Application.
 *
 * The list route, the detail route and the MCP `list_my_applications` tool all
 * return Application documents to the applicant. Each used to carry its own
 * deny-list, and they drifted: the list leaked the internal notes thread,
 * behaviour scores and recruiter-written status notes (rejection reasons
 * included). Every seeker-facing read goes through this one list instead.
 */

/** Recruiter-internal fields a candidate never receives. */
export const SEEKER_HIDDEN_APPLICATION_FIELDS = [
  "employerNotes",
  "agentNotes",
  "notes",
  "rejectionReason",
  "matchNotes",
  "matchStrengths",
  "matchGaps",
  "matchBreakdown",
  "qualifications",
  "requirementsStatus",
  "missingSkills",
  "weightsApplied",
  "behaviorSignals",
  "behaviorScore",
  "aiMatchNotifiedAt",
  "viewedByEmployerAt",
  "slaAlertSentAt",
  "strongAlertSentAt",
] as const;

/** Mongoose projection that excludes the hidden fields at query time. */
export const SEEKER_APPLICATION_PROJECTION = SEEKER_HIDDEN_APPLICATION_FIELDS.map((f) => `-${f}`).join(" ");

interface StatusEntry {
  status?: unknown;
  changedAt?: unknown;
  changedBy?: unknown;
  note?: unknown;
}

/**
 * Returns a copy safe for the applicant. Status history keeps its timeline,
 * but a note survives only when the seeker wrote it themselves (a withdrawal
 * note) — staff notes carry rejection reasons and internal commentary — and
 * `changedBy` never leaves the server.
 */
export function redactApplicationForSeeker<T extends Record<string, unknown>>(
  app: T,
  seekerUserId: string,
): T {
  const out: Record<string, unknown> = { ...app };
  for (const key of SEEKER_HIDDEN_APPLICATION_FIELDS) delete out[key];

  if (Array.isArray(out.statusHistory)) {
    out.statusHistory = (out.statusHistory as StatusEntry[]).map((entry) => {
      const ownNote = entry.changedBy != null && String(entry.changedBy) === String(seekerUserId);
      return {
        status: entry.status,
        changedAt: entry.changedAt,
        ...(ownNote && entry.note ? { note: entry.note } : {}),
      };
    });
  }

  if (typeof out.seekerMatchScore === "number") out.aiMatchScore = out.seekerMatchScore;
  return out as T;
}
