/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

import { LEGACY_PERSONAL_DATA_CACHES } from "@/lib/pwa/cacheNames";
import { runtimeCaching } from "@/lib/pwa/runtimeCaching";

// This declares the value of `injectionPoint` to TypeScript.
// Also declare ServiceWorkerGlobalScope since tsconfig uses "dom" lib
// which doesn't include it — the triple-slash webworker reference alone
// isn't sufficient when "dom" is present.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

type ServiceWorkerGlobalScope = WorkerGlobalScope &
  typeof globalThis & { registration: unknown; clients: unknown };

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        // Static HTML in /public — precaches reliably. A dynamic App Router
        // route (e.g. /~offline) is server-rendered as a streamed/chunked
        // response because the root layout calls headers(); the Service
        // Worker's precache of that response hangs and the SW never activates.
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// The previous worker cached every same-origin /api reply and page for 24 hours
// (Serwist's defaultCache), which stayed readable offline after sign-out, and
// kept remote photos in its image caches. This worker never writes any of
// those caches; delete what the old one left behind.
self.addEventListener("activate", (event: Event) => {
  (event as Event & { waitUntil(promise: Promise<unknown>): void }).waitUntil(
    Promise.all(LEGACY_PERSONAL_DATA_CACHES.map((name) => caches.delete(name))),
  );
});

// ── Web Push ────────────────────────────────────────────────────────────────
// Payload shape comes from src/lib/push.ts: { title, body, link }
self.addEventListener("push", (event: any) => {
  let payload: { title?: string; body?: string; link?: string };
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text?.() };
  }
  event.waitUntil(
    (self.registration as ServiceWorkerRegistration).showNotification(
      payload.title ?? "Mployedin",
      {
        body: payload.body ?? "",
        icon: "/logo.png",
        badge: "/logo.png",
        data: { link: payload.link ?? "/" },
      }
    )
  );
});

self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const link: string = event.notification.data?.link ?? "/";
  event.waitUntil(
    (self.clients as Clients).matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          (client as WindowClient).navigate(link);
          return (client as WindowClient).focus();
        }
      }
      return (self.clients as Clients).openWindow(link);
    })
  );
});
