/**
 * The storage names that older builds left in localStorage. Two groups:
 *
 * - Preference keys that moved behind prefStorage as `ui:<old-name>`. The
 *   components that migrate one once (`prefStorage.getWithLegacy`) import their
 *   legacy name from here, and `sweepLegacyPreferenceKeys` deletes every name
 *   in the list, for a visitor who objects to preferences before the page that
 *   owns a key has migrated it.
 * - Device copies that are not preferences at all: a data cache (exchange
 *   rates), and work in progress or a dismissal keyed by user id (poster
 *   edits, the temporary-password notice), which now live in the tab only.
 *   `sweepLegacyDeviceCopies` deletes them on every page load, whatever the
 *   visitor chose, and nothing migrates them.
 *
 * Add a name here BEFORE passing it to `getWithLegacy`; the legacyKeys test
 * fails if a name is exported but not swept, or if a call site uses a literal.
 */
import { POSTER_EDIT_PREFIX, TEMP_PASSWORD_NOTICE_PREFIX, removeStorageKeys } from "./deviceStorage";

export const LEGACY_COPILOT_FAB_POS_KEY = "copilot-fab-pos";
export const LEGACY_PWA_INSTALL_DISMISS_KEY = "pwa-install-dismissed";
export const LEGACY_SETUP_GUIDE_DISMISSED_KEY = "mployedin:setup-guide:dismissed";
export const LEGACY_SA_INSIGHTS_DISMISSED_KEY = "sa_insights_dismissed";
export const LEGACY_A11Y_BUTTON_KEY = "mployedin.a11y.button";
export const LEGACY_CV_PREVIEW_HIDDEN_KEY = "cvBuilder.previewHidden";
/** A data cache, not a preference: no longer written, deleted wherever it is found. */
export const LEGACY_EXCHANGE_RATES_KEY = "mployedin_exchange_rates";

/*
 * These two families moved from localStorage to the tab (sessionStorage) under
 * the SAME names, so the legacy prefix is the current one, taken from
 * deviceStorage.ts and not typed a second time. Caution if a current prefix is
 * ever renamed: this sweep would then stop matching the old localStorage copies,
 * so give the old name its own literal here at that point.
 */
/** Followed by an id: `poster-edit:<generationId>`. Now a tab (sessionStorage) key of the same name. */
export const LEGACY_POSTER_EDIT_PREFIX: string = POSTER_EDIT_PREFIX;
/** Followed by an id: `mployedin:temp-password-notice-dismissed:<userId>`. Now a tab key of the same name. */
export const LEGACY_TEMP_PASSWORD_NOTICE_PREFIX: string = TEMP_PASSWORD_NOTICE_PREFIX;

/** Exact preference names the preference sweep removes. */
export const LEGACY_PREFERENCE_KEYS: readonly string[] = [
  LEGACY_COPILOT_FAB_POS_KEY,
  LEGACY_PWA_INSTALL_DISMISS_KEY,
  LEGACY_SETUP_GUIDE_DISMISSED_KEY,
  LEGACY_SA_INSIGHTS_DISMISSED_KEY,
  LEGACY_A11Y_BUTTON_KEY,
  LEGACY_CV_PREVIEW_HIDDEN_KEY,
];

/** Exact names of device copies that are not preferences; removed on every load. */
export const LEGACY_DEVICE_COPY_KEYS: readonly string[] = [LEGACY_EXCHANGE_RATES_KEY];

/** Prefixes of device copies that are not preferences (every localStorage key that starts with one). */
export const LEGACY_DEVICE_COPY_PREFIXES: readonly string[] = [
  LEGACY_POSTER_EDIT_PREFIX,
  LEGACY_TEMP_PASSWORD_NOTICE_PREFIX,
];

/**
 * Remove every legacy preference key from localStorage. Called when preferences
 * are withdrawn and on page load while they are off. Never throws: with storage
 * blocked there is nothing to remove.
 */
export function sweepLegacyPreferenceKeys(): void {
  try {
    for (const key of LEGACY_PREFERENCE_KEYS) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing is stored under these names.
  }
}

/**
 * Remove the old device copies that are not preferences: the exchange-rate
 * cache, poster edits and temporary-password dismissals left in localStorage.
 * Runs on every page load, whatever the visitor chose about preferences; it
 * only touches localStorage, so the tab's current keys of the same names stay.
 * Deleted, not migrated: a lost poster edit or dismissal costs the visitor
 * little (a saved poster comes back from the server; the notice shows once more).
 * Never throws: with storage blocked there is nothing to remove.
 */
export function sweepLegacyDeviceCopies(): void {
  try {
    for (const key of LEGACY_DEVICE_COPY_KEYS) localStorage.removeItem(key);
    removeStorageKeys(localStorage, (key) => LEGACY_DEVICE_COPY_PREFIXES.some((prefix) => key.startsWith(prefix)));
  } catch {
    // Storage blocked: nothing is stored under these names.
  }
}
