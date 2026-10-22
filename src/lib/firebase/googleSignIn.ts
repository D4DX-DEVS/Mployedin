import { GooglePopupBlockedError } from "./googlePopupBlocked";

export { GooglePopupBlockedError };

/**
 * The "Continue with Google" click, in one place.
 *
 * Nothing in this file imports Firebase at the top level, so any page can
 * import it for free: Firebase (and the IndexedDB databases and Google hosts
 * that come with it) is touched only inside `getGoogleIdToken`, which runs from
 * a click handler. This is the only module outside `lib/firebase/` that may
 * reach Firebase; ESLint (`no-restricted-imports`) enforces that.
 */

/**
 * The Auth instance an earlier attempt left alive after a blocked popup. On a
 * click that runs on this very instance the Google handshake is long done, so
 * if the browser blocked the window anyway, the browser's pop-up blocker is the
 * cause, not a slow first click.
 */
let keptAfterBlock: unknown = null;

/**
 * Downloads our own JavaScript for the sign-in so the click does not wait on a
 * chunk (Safari blocks a popup opened after a slow await). Safe on hover, focus
 * and touch: it only evaluates modules; it never starts Firebase, so no
 * IndexedDB database is created and no Google host is contacted.
 */
export function preloadGoogleSignIn(): void {
  void import("./client").catch(() => {});
  void import("firebase/auth").catch(() => {});
}

/**
 * Opens the Google popup and returns the Firebase ID token for the server to
 * verify. Firebase is disposed afterwards whatever happens (token, closed
 * popup, network error): the caller only needs the token string, and keeps its
 * own error handling, so the original error is rethrown unchanged. After a
 * success the clean-up runs in the background and is not awaited: the token is
 * already in hand, and the caller's own sign-in exchange outlasts it. After a
 * failure it is awaited, so a quick second click never meets a half-deleted app.
 *
 * Two outcomes for a popup the browser blocked:
 *
 * - First block: Firebase's handshake with Google starts at the click, so on a
 *   slow connection Safari's short user-activation window can run out before
 *   `window.open`. The handshake has finished by then, and Firebase's popup
 *   resolver caches it for the whole page (that is what makes the next click
 *   fast, whichever Auth instance it runs on), so a `GooglePopupBlockedError`
 *   is thrown and the visitor is asked to press again. The instance is kept
 *   (in-memory only: nothing persisted, nobody signed in) for one reason: a
 *   block on that very instance can then be told apart from a slow first click.
 *   It is disposed after that attempt, or when the page goes away (see
 *   `client.ts`).
 * - A block on that retry: the handshake was done and `window.open` ran inside
 *   the click, and was still blocked, so the browser really blocks pop-ups and
 *   asking to "press again" would loop for ever. Firebase is disposed and the
 *   original Firebase error (code `auth/popup-blocked`) is rethrown; callers
 *   show their "allow pop-ups" message for it.
 */
export async function getGoogleIdToken(): Promise<string> {
  let client: typeof import("./client") | undefined;
  let attempted: unknown = null;
  let onKeptInstance = false;
  let keepForRetry = false;
  let succeeded = false;
  try {
    const [clientModule, { signInWithPopup }] = await Promise.all([import("./client"), import("firebase/auth")]);
    client = clientModule;
    // A clean-up still running from an earlier success is deleting the instance
    // getFirebaseAuth would hand back: wait, and this click gets a fresh one.
    await clientModule.whenFirebaseDisposed();
    const { auth, provider } = clientModule.getFirebaseAuth();
    attempted = auth;
    onKeptInstance = keptAfterBlock !== null && keptAfterBlock === auth;
    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();
    succeeded = true;
    return idToken;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "auth/popup-blocked" && !onKeptInstance) {
      keepForRetry = true;
      keptAfterBlock = attempted;
      throw new GooglePopupBlockedError({ cause: error });
    }
    throw error;
  } finally {
    if (!keepForRetry) {
      keptAfterBlock = null;
      const cleanup = disposeQuietly(client);
      if (!succeeded) await cleanup;
    }
  }
}

/** Disposes Firebase; resolves whatever happens, so it can be left running in the background. */
async function disposeQuietly(client: typeof import("./client") | undefined): Promise<void> {
  try {
    await client?.disposeFirebase();
  } catch {
    // Nothing a visitor can act on, and the real outcome is already decided.
  }
}
