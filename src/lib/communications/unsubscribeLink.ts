/**
 * Signed unsubscribe links for the footer of outgoing mail.
 *
 * Every job email's footer used to link to `/api/unsubscribe?ref=digest` with
 * no token, and the route answers a tokenless request with "Missing unsubscribe
 * token" — so the link a seeker clicks to stop our mail opened an error page.
 * The weekly digest sent `?token=WEEKLY`, a literal no secret will verify. The
 * only working exit left was "Report spam", which Gmail counts against the
 * whole sending domain.
 *
 * The token format is the one `/api/unsubscribe` already verifies: HS256 over
 * `{ userId, action: "unsubscribe", category? }`. With a category the route
 * turns off that one category (`categories.<category>.enabled`), without one it
 * sets `unsubscribedAll` — so a digest link stops job emails, not password
 * resets or interview invites.
 */

import jwt from "jsonwebtoken";

/** How long a link in an old email keeps working. Matches the List-Unsubscribe header. */
const TOKEN_TTL = "90d";

/**
 * The secret the unsubscribe route verifies with. One definition, so a signer
 * can never drift from the verifier — the route has always preferred
 * JWT_SECRET, while the List-Unsubscribe header in email.ts signs with
 * NEXTAUTH_SECRET alone and only works where the two agree or JWT_SECRET is unset.
 */
export function unsubscribeSecret(): string | undefined {
  return process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
}

/**
 * A one-click unsubscribe URL for one recipient, or `null` when no link that
 * would actually work can be built. Callers omit the link on `null`: no link is
 * better than one that opens an error page.
 *
 * @param category a NotificationPreference category key (`jobs`, `marketing`,
 *   …) to turn off just that stream; omit to unsubscribe from everything.
 * @param ref attribution tag, carried alongside the token for reporting.
 */
export function unsubscribeUrl(
  baseUrl: string,
  userId: string,
  opts: { category?: string; ref?: string } = {},
): string | null {
  const secret = unsubscribeSecret();
  if (!secret || !userId) return null;

  const token = jwt.sign(
    { userId, action: "unsubscribe", ...(opts.category ? { category: opts.category } : {}) },
    secret,
    { expiresIn: TOKEN_TTL },
  );
  const ref = opts.ref ? `&ref=${encodeURIComponent(opts.ref)}` : "";
  return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(token)}${ref}`;
}

/**
 * Where a user of this role manages their notification settings.
 *
 * Notification emails linked every role to `/en/settings/notifications`, a
 * route that does not exist — "Manage preferences" was a 404 for everyone.
 * Only the seeker and admin have a dedicated page; the other roles keep it as
 * a tab of their settings page.
 */
export function notificationSettingsPath(role: string | undefined, locale = "en"): string {
  switch (role) {
    case "job_seeker":
      return `/${locale}/job-seeker/settings/notifications`;
    case "admin":
      return `/${locale}/admin/settings/notifications`;
    case "employer":
      return `/${locale}/employer/settings?tab=notifications`;
    case "agent":
      return `/${locale}/agent/settings?tab=notifications`;
    case "super_agent":
      return `/${locale}/super-agent/settings?tab=notifications`;
    default:
      // The inbox exists for every role and links on to settings from there.
      return `/${locale}/notifications`;
  }
}
