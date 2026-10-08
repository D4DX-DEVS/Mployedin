/**
 * The single definition of "a job the public may see and apply to" (JL-8 / AP-7).
 *
 * The public list filtered on status, visibility and expiry, but the detail
 * page and both apply paths only checked `status === "active"`, so private,
 * invite-only, soft-deleted and past-deadline jobs stayed viewable and
 * applicable by URL — and applications were accepted for up to a day after
 * `expiresAt`, until the daily expiry cron flipped the status.
 *
 * `visibility` uses $nin (not equality) so legacy docs without the field stay
 * public; `expiresAt: null` also matches a missing field. The expiry clause
 * sits in `$and` so callers can add their own `$or` without clobbering it.
 */
export function publicJobFilter(now: Date = new Date()): Record<string, unknown> {
  return {
    status: "active",
    deletedAt: null,
    visibility: { $nin: ["private", "invite_only"] },
    $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
  };
}
