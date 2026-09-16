/**
 * Which cross-origin requests the Service Worker must never cache.
 *
 * Lives outside `app/sw.ts` because that file is a worker entry — importing it
 * constructs a `Serwist` instance and reads `self.__SW_MANIFEST`, so the rule
 * it enforces could not otherwise be unit-tested. See
 * `__tests__/security/swAuthBypass.test.ts`.
 */

/** Origins that serve one-shot, state-bearing responses for Google sign-in. */
export const AUTH_ORIGINS: readonly string[] = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://accounts.google.com",
  "https://apis.google.com",
  "https://www.googleapis.com",
];

/**
 * True when the request is part of an authentication handshake and must go to
 * the network every time.
 *
 * `@serwist/next`'s `defaultCache` ends with a catch-all `cross-origin`
 * NetworkFirst that holds every cross-origin GET for an hour. Firebase's popup
 * flow is made of exactly such GETs — the `__/auth/iframe` and `__/auth/handler`
 * documents on the Firebase authDomain, gapi's `api.js`, and the
 * identitytoolkit project-config lookup. Replaying a stale handler breaks the
 * popup's credential handoff to its opener, and the opener's `signInWithIdp`
 * POST then fails as an opaque network error that Chrome reports as a CORS
 * preflight failure. A fresh browser profile has an empty cross-origin cache,
 * which is why the same build signs in fine on another machine.
 */
export function isAuthRequest(url: URL): boolean {
  return (
    AUTH_ORIGINS.includes(url.origin) ||
    url.hostname.endsWith(".firebaseapp.com") ||
    url.pathname.startsWith("/__/auth/")
  );
}
