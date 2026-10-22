"use client";

import { useEffect } from "react";

import { hasServiceWorkerOptIn, rememberServiceWorkerOptIn } from "@/lib/pwa/enableServiceWorker";
import {
  deleteLegacyRuntimeCaches,
  hasPushSubscription,
  removeServiceWorkerData,
} from "@/lib/pwa/serviceWorkerCleanup";

/** The app is running installed, which the person did on purpose. */
function isStandalone(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

/**
 * Registers the service worker, with the update and hand-over handling every
 * registered page needs.
 */
function registerWorker(): void {
  // The old defaultCache filled runtime caches with API replies and pages. The
  // new worker deletes them when it activates; this covers the gap until a
  // device's worker has updated.
  void deleteLegacyRuntimeCaches();

  // sw.ts sets skipWaiting + clientsClaim, so a worker from a fresh deploy
  // takes over THIS document mid-session. The document is still running the
  // previous build's chunk hashes, which the new precache no longer holds and
  // the deploy has already dropped from the CDN — every later lazy import
  // (the Google sign-in chunk among them) then 404s on a page that looks
  // fine, and the navigation itself fails with Serwist's `no-response`.
  // Reload once when control changes so document and worker are one build —
  // unless the visitor has typed into the page: reloading then wiped a
  // half-filled form mid-session. In that case the next navigation brings in
  // the new build instead (Next falls back to a full page load when a chunk
  // of the old build is gone). `hadController` keeps the very first
  // registration from reloading.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  let userHasTyped = false;
  const markTyped = () => {
    userHasTyped = true;
  };
  document.addEventListener("input", markTyped, { capture: true, once: true });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading || userHasTyped) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => {
      // Check for updates periodically (every hour)
      setInterval(
        () => {
          registration.update();
        },
        60 * 60 * 1000,
      );
    })
    .catch((error) => {
      console.error("[SW] Registration failed:", error);
    });
}

/**
 * For a visitor who never asked for a worker: remove any that is left over from
 * before this rule, together with the caches it wrote.
 */
async function removeUnrequestedWorker(): Promise<void> {
  // Notifications enabled before the opt-in flag existed are a user action too.
  // Unregistering that worker would silently end their pushes, so keep it and
  // record the request the flag would have recorded.
  if (await hasPushSubscription()) {
    rememberServiceWorkerOptIn();
    registerWorker();
    return;
  }
  await removeServiceWorkerData();
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Outside production we never register a worker. A worker registered by a
    // prior `npm run start` (prod) build keeps controlling the localhost origin
    // in dev, and its stale precache (prod chunk hashes that 404 under the dev
    // server) leaves it broken — it then returns empty/invalid bodies for
    // `/api/auth/*`, so NextAuth's `res.json()` throws
    // "Unexpected end of JSON input" (ClientFetchError). Proactively remove any
    // leftover worker and its caches so dev is never controlled by a stale SW.
    if (process.env.NODE_ENV !== "production") {
      // ponytail: unregister + reload once. Unregistering alone isn't enough —
      // the current document is still served by the old worker, so a stale
      // precache keeps showing a dead shell (blank/404) until a manual hard
      // reload. sessionStorage guard prevents a reload loop if cleanup fails.
      const wasControlled = Boolean(navigator.serviceWorker.controller);
      void Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(registrations.map((r) => r.unregister())),
          ),
        "caches" in window
          ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          : Promise.resolve(),
      ])
        .then(() => {
          if (!wasControlled) return;
          if (sessionStorage.getItem("sw-dev-cleanup-reloaded")) return;
          sessionStorage.setItem("sw-dev-cleanup-reloaded", "1");
          window.location.reload();
        })
        .catch(() => {/* dev-only cleanup — never block the app */});
      return;
    }

    // A worker runs only for someone who asked for it: the app runs installed,
    // or they tapped Install / Enable notifications (lib/pwa/enableServiceWorker).
    // Everyone else gets none, so nothing from a signed-in session can outlive
    // it in a cache.
    if (isStandalone()) {
      // Running installed is a user action. Record it, so a later visit in a
      // normal browser tab (same origin, same registration) keeps the worker
      // the installed app relies on instead of unregistering it.
      rememberServiceWorkerOptIn();
      registerWorker();
      return;
    }
    if (hasServiceWorkerOptIn()) {
      registerWorker();
      return;
    }
    void removeUnrequestedWorker();
  }, []);

  return null;
}
