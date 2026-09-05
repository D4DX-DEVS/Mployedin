/**
 * Team membership (invite a colleague into the employer workspace) is parked.
 *
 * `POST /api/employers/team` answers 501 because an accepted invite never
 * reaches the invitee's session, so the ACLs behind it are dead code
 * (EMPLOYER-FIX-PLAN E6, Option A). The page still renders — it is reachable by
 * bookmark and from the activity-logs screen — so the UI has to read the same
 * flag the endpoint does, or it shows a working-looking invite button that
 * fails on submit.
 *
 * Flip this to `true` together with re-enabling `postHandler` in that route.
 */
export const TEAM_INVITE_ENABLED = false;
