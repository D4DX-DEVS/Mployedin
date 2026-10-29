/**
 * Who an admin broadcast reaches. One definition for the count the admin
 * confirms before sending, the count the send reports, and the Inngest worker
 * that delivers it, so the number on the confirm dialog is the number reached.
 *
 * Browser-safe: the WhatsApp schedule form imports the roles from here. What
 * reads the database (the marketing opt-in list) is in broadcastAudienceServer.ts.
 */

export const BROADCAST_ROLES = ["admin", "super_agent", "agent", "employer", "job_seeker"] as const;
export type BroadcastRole = (typeof BROADCAST_ROLES)[number];

export const BROADCAST_PURPOSES = ["service", "marketing"] as const;
export type BroadcastPurpose = (typeof BROADCAST_PURPOSES)[number];

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

/** Adds an `_id` range to an audience query without dropping a marketing `$in`. */
export function withIdRange(query: Record<string, unknown>, range: Record<string, unknown>): Record<string, unknown> {
  const current = query._id && typeof query._id === "object" ? (query._id as Record<string, unknown>) : {};
  return { ...query, _id: { ...current, ...range } };
}

/** Roles from a `?roles=a,b` query string; unknown values are dropped. */
export function parseBroadcastRoles(raw: string | null): BroadcastRole[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is BroadcastRole => (BROADCAST_ROLES as readonly string[]).includes(role));
}
