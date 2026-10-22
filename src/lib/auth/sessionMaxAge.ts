/**
 * How long a signed-in session lasts, in seconds: 3 days, renewed while the site is used. Shared by the edge
 * config (the proxy re-issues the session cookie with this lifetime) and the Node config, so both agree; without
 * it the edge config fell back to Auth.js's 30-day default. The Cookie Policy states the same figure: the
 * registry rows for the authjs cookies say "up to 3 days" (sessionMaxAge.test.ts keeps them in step).
 *
 * No imports: this file is read by the Edge runtime.
 */
export const SESSION_MAX_AGE_S = 3 * 24 * 60 * 60;
