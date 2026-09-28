/**
 * Who an admin broadcast reaches. One definition for the count the admin
 * confirms before sending, the count the send reports, and the Inngest worker
 * that delivers it, so the number on the confirm dialog is the number reached.
 */
export const BROADCAST_ROLES = ["admin", "super_agent", "agent", "employer", "job_seeker"] as const;
export type BroadcastRole = (typeof BROADCAST_ROLES)[number];

export function broadcastRecipientQuery(
  targetAll: boolean,
  targetRoles?: readonly string[] | null
): Record<string, unknown> {
  const query: Record<string, unknown> = { isActive: true };
  if (!targetAll && targetRoles && targetRoles.length > 0) {
    query.role = targetRoles.length === 1 ? targetRoles[0] : { $in: [...targetRoles] };
  }
  return query;
}

/** Roles from a `?roles=a,b` query string; unknown values are dropped. */
export function parseBroadcastRoles(raw: string | null): BroadcastRole[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is BroadcastRole => (BROADCAST_ROLES as readonly string[]).includes(role));
}
