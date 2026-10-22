/**
 * Goes to `target` with a full page load, not a client-side (router) navigation,
 * and replaces the current history entry, as `router.replace` did.
 *
 * After a Google sign-in this is what drops the hidden Google iframe and
 * `window.gapi` that Firebase's popup resolver adds to the page: they live as
 * long as the document does, and deleting the Firebase app does not remove
 * them. A client-side navigation would carry them into the dashboard session.
 * Replacing the entry keeps Back from returning through /login (or the sign-in
 * card), and means the page that held the frame is never restored from the
 * back/forward cache. Its own module so tests can replace it (jsdom cannot
 * navigate); `location` is a parameter for the same reason.
 */
export function navigateWithPageLoad(target: string, location: Pick<Location, "replace"> = window.location): void {
  location.replace(target);
}
