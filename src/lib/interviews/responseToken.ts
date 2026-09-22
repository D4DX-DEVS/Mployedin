/**
 * Secret-token links that let a candidate answer an interview invitation
 * straight from the email, without signing in.
 *
 * Why not mail-client RSVP buttons: `ATTENDEE` + `METHOD:REQUEST` makes Gmail
 * and Outlook show Yes/No/Maybe, but pressing one sends an iTIP `REPLY` email
 * to the ORGANIZER address. This app has no inbound mail processing, so that
 * reply goes nowhere — the candidate sees "response sent" while
 * `Interview.candidateResponse` stays `pending` and the employer chases them.
 * A silently diverging second channel is worse than no buttons at all.
 *
 * The token is the same shape as `User.calendarFeedToken`: unguessable, stored
 * with `select: false`, and revocable by clearing the field.
 */

import { randomBytes } from "crypto";

/**
 * 24 random bytes as base64url — 32 characters, 192 bits.
 * The bound is deliberate: it is what the public route validates before it
 * touches the database, so a path segment can never reach a query as junk.
 */
export const RESPONSE_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function generateResponseToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The page a candidate opens from the email.
 *
 * Deliberately a *page*, not the mutating API route: mail clients and security
 * scanners prefetch links, so a GET that recorded a response would auto-accept
 * every invitation the moment it was delivered. The page renders buttons; only
 * the POST behind them writes anything.
 */
export function responseUrl(token: string, baseUrl: string, locale: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${locale}/interview-response/${token}`;
}

/**
 * The interview's token, minting one if it predates the field.
 *
 * Returns null when the interview does not exist, so callers building an
 * invitation can simply omit the link rather than fail the send.
 */
export async function ensureResponseToken(interviewId: string): Promise<string | null> {
  const { connectDB } = await import("@/lib/db/mongoose");
  await connectDB();
  const { default: Interview } = await import("@/models/Interview");

  const doc = await Interview.findById(interviewId)
    .select("+responseToken")
    .lean<{ responseToken?: string } | null>();
  if (!doc) return null;
  if (doc.responseToken) return doc.responseToken;

  const token = generateResponseToken();
  await Interview.updateOne({ _id: interviewId }, { $set: { responseToken: token } });
  return token;
}
