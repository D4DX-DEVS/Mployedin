"use client";

import { useEffect } from "react";

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

        // Listen for updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "activated" &&
              navigator.serviceWorker.controller
            ) {
              // New version available — user will get it on next navigation
              console.log(
                "[SW] New content available; will be used on next reload.",
              );
            }
          });
        });
      })
      .catch((error) => {
        console.error("[SW] Registration failed:", error);
      });
  }, []);

  return null;
}
