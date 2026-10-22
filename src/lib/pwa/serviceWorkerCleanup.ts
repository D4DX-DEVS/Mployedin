/**
 * Clean-up for devices that hold a service worker or its caches without the
 * person having asked for one. Every step is best effort and never rejects:
 * storage, the Cache API and IndexedDB can each be missing or blocked.
 */
import { deleteIndexedDb } from "@/lib/browser/indexedDb";

import { isKnownServiceWorkerCache, LEGACY_PERSONAL_DATA_CACHES, SERWIST_EXPIRATION_DB } from "./cacheNames";

/** Deletes the matching caches and says how many there were. */
async function deleteCaches(shouldDelete: (name: string) => boolean): Promise<number> {
  try {
    if (typeof caches === "undefined") return 0;
    const names = (await caches.keys()).filter(shouldDelete);
    await Promise.all(names.map((name) => caches.delete(name)));
    return names.length;
  } catch {
    // Cache API blocked — nothing more can be done from here.
    return 0;
  }
}

/**
 * Deletes, by name, the caches the old `defaultCache` filled with API replies,
 * pages and images (remote photos included). Needs no `keys()` call, so it
 * stays cheap on a sign-out path.
 */
export async function deleteLegacyRuntimeCaches(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    await Promise.all(LEGACY_PERSONAL_DATA_CACHES.map((name) => caches.delete(name)));
  } catch {
    // Cache API blocked.
  }
}

/** Unregisters every worker on this origin and says how many there were. */
async function unregisterAll(): Promise<number> {
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    return registrations.length;
  } catch {
    // no service worker support, or blocked
    return 0;
  }
}

/**
 * True when some registration on this origin holds a push subscription. That is
 * only ever created by someone tapping Enable notifications, so it counts as a
 * user action taken before the opt-in flag existed.
 */
export async function hasPushSubscription(): Promise<boolean> {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations();
    for (const registration of registrations ?? []) {
      if (await registration.pushManager?.getSubscription()) return true;
    }
  } catch {
    // no service worker support, or blocked
  }
  return false;
}

/**
 * Removes every worker on this origin and every cache this site's worker ever
 * wrote — by known name only, so another library's caches are left alone.
 */
export async function removeServiceWorkerData(): Promise<void> {
  const [unregistered, cleared] = await Promise.all([unregisterAll(), deleteCaches(isKnownServiceWorkerCache)]);
  // Serwist's expiration bookkeeping only exists once a worker or cache did, so
  // an anonymous page load that found neither does no IndexedDB work at all.
  if (unregistered > 0 || cleared > 0) await deleteIndexedDb(SERWIST_EXPIRATION_DB);
}
