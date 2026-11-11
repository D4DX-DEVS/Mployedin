/**
 * Whether this browser's session is over, as the server sees it.
 *
 * Asked after a sign-out, before the person is sent to the login page: the
 * session cookie is HttpOnly, so the page cannot look for itself, and a
 * sign-out request can be lost (a slow connection, a navigation that cuts it
 * off) without any error reaching the caller.
 *
 * True only for a clear "no session" (Auth.js answers `null`, or an object
 * without a user). Anything unclear, offline or a server error, is false: the
 * caller then says the sign-out did not work, which is the safe mistake.
 * Never throws.
 *
 * Gives up after SESSION_CHECK_TIMEOUT_MS (answer: not ended). Without a limit a
 * stalled connection would keep the caller's "Logging out..." state, with its
 * buttons disabled, until the browser's own timeout minutes later.
 */
export const SESSION_CHECK_TIMEOUT_MS = 8_000;

export async function sessionEnded(): Promise<boolean> {
  const controller = new AbortController();
  const giveUp = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    if (body === null || typeof body !== "object") return body === null;
    return !(body as { user?: unknown }).user;
  } catch {
    return false;
  } finally {
    clearTimeout(giveUp);
  }
}
