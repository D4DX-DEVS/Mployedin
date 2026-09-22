/**
 * Which interview edits a calendar client needs to hear about.
 *
 * Two failure modes this sits between:
 *
 *  - bump too rarely and the reader keeps a stale invitation, because a client
 *    ignores an update whose SEQUENCE has not advanced;
 *  - bump on every save and the candidate is re-prompted for edits they cannot
 *    even see, such as a typo fixed in the instructions.
 *
 * `rescheduleCount` cannot stand in for this: swapping the meeting link or the
 * venue changes what the reader must act on without being a reschedule.
 */

/** Fields whose value appears in, or moves, the event itself. */
export const MATERIAL_FIELDS = ["scheduledAt", "duration", "type", "location", "meetLink"] as const;

export function isMaterialChange(update: Record<string, unknown>): boolean {
  for (const field of MATERIAL_FIELDS) {
    if (update[field] !== undefined) return true;
  }
  // A cancellation is material; a completion is not — the meeting already
  // happened, and reissuing a calendar invitation for it would be absurd.
  return update.status === "cancelled";
}
