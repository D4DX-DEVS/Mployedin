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
