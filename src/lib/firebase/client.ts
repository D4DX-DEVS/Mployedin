import { initializeApp, getApps, deleteApp, type FirebaseApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";
import { deleteIndexedDb } from "@/lib/browser/indexedDb";
import { FIREBASE_DATABASES, markFirebaseActive, markFirebaseInactive } from "./state";

/**
 * Firebase Auth exists only to run the Google popup. Nothing here runs at
 * import: this module is loaded by dynamic import from a "Continue with Google"
 * click (see `googleSignIn.ts`), so opening a page never starts Firebase,
 * never creates its IndexedDB databases and never contacts a Google host.
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let sweepScheduled = false;
/** The dispose that is running, if any. */
let disposal: Promise<void> | null = null;

/**
 * Called only from a Google-button click handler, through a dynamic import.
 * Returns the instance that is already running if there is one. After a popup
 * the browser blocked, the helper keeps it, so that a second block on that very
 * instance can be told apart from a slow first click (see `googleSignIn.ts`).
 * That is all the kept instance is for: the retry is fast because the popup
 * resolver caches its Google handshake for the whole page, keyed by API key and
 * app name, so even a new instance after a dispose does not repeat it.
 *
 * Callers wait for `whenFirebaseDisposed()` first: while a dispose is running,
 * this would still return the instance that is being deleted.
 *
 * What a dispose cannot undo: Firebase's popup resolver is a page-lifetime
 * singleton. It adds a hidden iframe from the auth domain to the page and loads
 * Google's script into `window.gapi`, and neither `deleteApp` nor `signOut` removes
 * them. They go when the document does, which is why the callers leave with a
 * full page load after a successful sign-in. (A sign-in that fails or is closed
 * leaves the visitor on the page, so the frame stays until they leave it.)
 */
export function getFirebaseAuth(): { auth: Auth; provider: GoogleAuthProvider } {
  // Before anything is created: even a half-initialised instance may hold a database.
  markFirebaseActive();
  app ??= getApps()[0] ?? initializeApp(firebaseConfig);
  if (!auth) {
    // In-memory persistence: the signed-in Firebase user is never written to
    // IndexedDB / localStorage. Our own session (Auth.js) is the only state kept.
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    // Whatever happens to this instance (kept for a retry, or the page closing
    // while the Google window is open), it goes with the page.
    sweepDatabasesWhenPageGoes();
  }
  return { auth, provider: new GoogleAuthProvider() };
}

/**
 * When the page goes away: removes Firebase's databases and disposes an
 * instance that is still alive (one kept for a retry after a blocked popup).
 *
 * Firebase's library keeps its own connection to the heartbeat database open
 * for as long as the page lives (deleting the app does not close it), so a
 * delete made during dispose can be blocked, or the library can re-create the
 * database a moment later. One more delete as the page goes lets the browser
 * finish it once that connection closes. The deletes are started right here,
 * not after an await: the page may not live long enough to get to them.
 */
function sweepDatabasesWhenPageGoes(): void {
  if (sweepScheduled || typeof window === "undefined") return;
  sweepScheduled = true;
  window.addEventListener(
    "pagehide",
    () => {
      sweepScheduled = false;
      for (const name of FIREBASE_DATABASES) void deleteIndexedDb(name);
      // Also resets this module's own references, so a page restored from the
      // back/forward cache creates a new app and Auth on its next click. The
      // popup resolver's iframe and `window.gapi` are not Firebase app state
      // and survive that (see getFirebaseAuth).
      if (auth) void disposeFirebase();
    },
    { once: true },
  );
}

/**
 * Resolves once the dispose that is running has finished (at once if none is).
 * A click waits for this before `getFirebaseAuth()`, so it never signs in on an
 * instance that a clean-up from an earlier success is still deleting, and the
 * clean-up never ends under a click that is already running.
 */
export function whenFirebaseDisposed(): Promise<void> {
  return disposal ?? Promise.resolve();
}

/**
 * Drops Firebase once its ID token has been read: signs out the in-memory user,
 * deletes the app and removes Firebase's databases. Never throws, so it is safe
 * in a `finally`.
 *
 * One dispose at a time: a second request while one is running (the page going
 * away, the clean-up of an attempt that follows one) joins it.
 *
 * It does not remove the popup resolver's hidden iframe or `window.gapi` (see
 * getFirebaseAuth), and the heartbeat database can outlive it until the next
 * page load (see sweepDatabasesWhenPageGoes and StorageSweep).
 */
export function disposeFirebase(): Promise<void> {
  if (disposal) return disposal;
  const running: Promise<void> = disposeInstance(app, auth).finally(() => {
    if (disposal === running) disposal = null;
  });
  disposal = running;
  return running;
}

/** Disposes the instance it is given; only forgets it if that is still the instance this module holds. */
async function disposeInstance(target: FirebaseApp | null, targetAuth: Auth | null): Promise<void> {
  try {
    await targetAuth?.signOut();
  } catch {
    // The user only ever lived in memory; there is nothing else to undo.
  }
  try {
    if (target) await deleteApp(target);
    // Not an instance that has taken its place meanwhile: its references and its
    // "alive" flag are not this dispose's to clear.
    if (app === target && auth === targetAuth) {
      app = null;
      auth = null;
      markFirebaseInactive();
    }
  } catch {
    // Keep the references: a half-deleted app must not be initialised twice.
  }
  await Promise.all(FIREBASE_DATABASES.map((name) => deleteIndexedDb(name)));
  sweepDatabasesWhenPageGoes();
}
