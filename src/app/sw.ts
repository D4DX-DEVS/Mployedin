/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

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
  runtimeCaching: defaultCache,
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
