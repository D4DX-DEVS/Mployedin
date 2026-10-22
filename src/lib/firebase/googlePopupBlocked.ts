/**
 * Thrown by `getGoogleIdToken` when the browser refused to open the Google
 * window (Firebase's `auth/popup-blocked`).
 *
 * Its own file, with no Firebase import, so a page can use it in a `catch`
 * without pulling Firebase in. It keeps the Firebase error code, so code that
 * does not know the class still recognises a blocked popup, and the original
 * error as `cause`.
 */
export class GooglePopupBlockedError extends Error {
  readonly code = "auth/popup-blocked";

  constructor(options?: { cause?: unknown }) {
    super("The browser blocked the Google sign-in window.", options);
    this.name = "GooglePopupBlockedError";
    // Keeps `instanceof` working however the class is compiled.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
