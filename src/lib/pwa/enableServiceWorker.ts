/**
 * The service worker is registered only after a user action: tapping Install,
 * or tapping Enable notifications. Both call `enableServiceWorker()`, which
 * records the request and registers the worker. `<ServiceWorkerRegistration>`
 * re-registers it on later visits while the flag is set.
 *
 * The flag is deliberately NOT a `ui:*` key: those are deleted when a person
 * withdraws their Preferences consent, and this one records something the
 * person asked for (an installed app, push notifications), so it stays.
 */

export const SW_OPT_IN_KEY = "mployedin_sw_opt_in";

/** True once the person has asked for the worker. Storage can throw, so never assume. */
export function hasServiceWorkerOptIn(): boolean {
  try {
    return localStorage.getItem(SW_OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Records the request. A blocked or full storage must not stop the registration. */
export function rememberServiceWorkerOptIn(): void {
  try {
    localStorage.setItem(SW_OPT_IN_KEY, "1");
  } catch {
    // The worker still registers for this session; it just won't come back by itself.
  }
}

/**
 * Registers `/sw.js` for a person who asked for it. Resolves `null` instead of
 * rejecting when registration is impossible (no support, blocked, not a
 * production build), so callers decide what that means for them.
 *
 * Outside production no worker is registered: a worker left over from a
 * production build keeps controlling localhost and serves a dead precache, which
 * is why `<ServiceWorkerRegistration>` removes any it finds in dev.
 */
export async function enableServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (process.env.NODE_ENV !== "production") return null;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  rememberServiceWorkerOptIn();
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}
