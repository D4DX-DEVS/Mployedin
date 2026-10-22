/**
 * Helpers for the browser storage that outlives a session on a shared device.
 * Everything here is best-effort: storage can be blocked (private mode, a
 * locked-down browser), and a failure to tidy up must never break the page.
 */

/** Command-menu recents used to live in localStorage, one key per locale. */
export const LEGACY_RECENT_PAGES_PREFIX = "mployedin_recent_pages_";

/** The job form's local draft mirror, one key per user. */
export const JOB_DRAFT_PREFIX = "job-draft-";

/** The poster editor's unsaved edits, one tab (sessionStorage) key per poster generation. */
export const POSTER_EDIT_PREFIX = "poster-edit:";

/** The temporary-password notice's dismissal, one tab key per user (the id is in the key name). */
export const TEMP_PASSWORD_NOTICE_PREFIX = "mployedin:temp-password-notice-dismissed:";

export const posterEditKey = (generationId: string): string => `${POSTER_EDIT_PREFIX}${generationId}`;
export const tempPasswordNoticeKey = (userId: string): string => `${TEMP_PASSWORD_NOTICE_PREFIX}${userId}`;

/**
 * How long after a sign-out's cleanup starts that autosavers stay quiet. Long
 * enough to cover the cleanup (at most about 2.5 s) and the sign-out request
 * that follows; short enough that a sign-out which never navigates cannot leave
 * a person who is still signed in without autosave.
 */
const SIGN_OUT_WINDOW_MS = 15_000;

let signOutStartedAt: number | null = null;

/**
 * Set when a sign-out's device cleanup starts. Writers that run on a timer or
 * an effect (the Copilot chat auto-save, the job form's debounced draft
 * autosave) check it and skip, so they cannot put back what the cleanup just
 * wiped in the moments before the page navigates away.
 *
 * Module state, and not cleared by navigation alone: a client-side
 * `router.replace` keeps this module alive into the next sign-in. So it expires
 * on its own after SIGN_OUT_WINDOW_MS, and a sign-out that fails or that moves
 * on without a reload calls `resetSignOutInProgress()`.
 */
export function markSignOutStarted(): void {
  signOutStartedAt = Date.now();
}

export function isSignOutInProgress(): boolean {
  return signOutStartedAt !== null && Date.now() - signOutStartedAt < SIGN_OUT_WINDOW_MS;
}

/** For a sign-out that failed, or that moved on without a page reload, so autosave works again. */
export function resetSignOutInProgress(): void {
  signOutStartedAt = null;
}

/**
 * Keys of a Storage object. Walks `length`/`key()` rather than `Object.keys`:
 * the storage-fallback shim swaps in an object whose own enumerable keys are
 * its methods, not the stored entries.
 */
export function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

/** Removes every key `match` accepts. Never throws. */
export function removeStorageKeys(storage: Storage, match: (key: string) => boolean): void {
  try {
    for (const key of storageKeys(storage)) {
      if (!match(key)) continue;
      try {
        storage.removeItem(key);
      } catch {
        // one blocked key must not stop the rest
      }
    }
  } catch {
    // storage unavailable
  }
}

/** Deletes the browsing-history keys the command menu used to keep on the device. */
export function purgeLegacyRecentPages(): void {
  try {
    removeStorageKeys(window.localStorage, (key) => key.startsWith(LEGACY_RECENT_PAGES_PREFIX));
  } catch {
    // storage unavailable
  }
}
