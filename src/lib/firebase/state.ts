/**
 * Whether a Firebase instance is alive in this page, and the names of the
 * IndexedDB databases Firebase leaves on our origin.
 *
 * Deliberately free of any Firebase import: StorageSweep (mounted on every
 * page) reads it, and must not pull Firebase into pages that never use it.
 * `client.ts` is the only writer.
 */

/** Firebase's own IndexedDB databases on our origin; also removed at sign-out (logoutCleanup). */
export const FIREBASE_DATABASES = ["firebaseLocalStorageDb", "firebase-heartbeat-database"] as const;

let active = false;

/** Firebase was started in this page: something may hold its databases open. */
export function markFirebaseActive(): void {
  active = true;
}

/** The instance was disposed. */
export function markFirebaseInactive(): void {
  active = false;
}

export function isFirebaseActive(): boolean {
  return active;
}
