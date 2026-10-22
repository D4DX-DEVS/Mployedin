/**
 * The service worker's runtime caching rules.
 *
 * Lives outside `app/sw.ts` because that file is a worker entry — importing it
 * constructs a `Serwist` instance and reads `self.__SW_MANIFEST`, so the rules
 * could not otherwise be unit-tested. See `__tests__/lib/pwa/runtimeCaching.test.ts`.
 *
 * These replace `@serwist/next`'s `defaultCache`, which cached every same-origin
 * GET /api/* reply and every page / RSC payload for 24 hours. After sign-out the
 * admin user list (with email addresses) was still readable offline and the
 * admin dashboard still rendered. The rule now is: personal data never touches
 * a cache. Only hashed build assets and static art do.
 *
 * Serwist uses the FIRST rule whose matcher accepts a request, and does not
 * touch a request no rule accepts (the browser handles it natively, nothing is
 * stored). So order matters: every "never cache" rule precedes every cache rule.
 */
import type { RuntimeCaching } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly } from "serwist";

import { isAuthRequest } from "@/lib/security/swAuthBypass";

import { LEGACY_RUNTIME_CACHES } from "./cacheNames";

export { LEGACY_RUNTIME_CACHES };

const DAY_SECONDS = 24 * 60 * 60;

/** Same-origin path under /api. */
function isApiRequest(url: URL, sameOrigin: boolean): boolean {
  return sameOrigin && (url.pathname === "/api" || url.pathname.startsWith("/api/"));
}

const IMAGE_OPTIMIZER_PATH = "/_next/image";

/**
 * An image the optimizer serves from something other than the site's own public
 * art: a remote host (Google, LinkedIn, Cloudinary, Spaces: avatars, logos and
 * candidate photos), an /api route, or anything we cannot tell is local. Only a
 * plain local path such as /icons/x.png is safe to keep on a device. `//host`
 * and `/\host` are remote in a browser's eyes, and a missing `url` is unknown.
 */
function isNonLocalOptimizedImage(url: URL, sameOrigin: boolean): boolean {
  if (!sameOrigin || !url.pathname.startsWith(IMAGE_OPTIMIZER_PATH)) return false;
  const source = url.searchParams.get("url") ?? "";
  const isLocalPath = source.startsWith("/") && !source.startsWith("//") && !source.startsWith("/\\");
  return !isLocalPath || source.startsWith("/api");
}

/** A page load: a top-level navigation, an iframe, or anything fetched as a document. */
function isDocumentRequest(request: Request): boolean {
  return request.mode === "navigate" || request.destination === "document";
}

/** A React Server Component payload: the dashboard's data, in flight as a fetch. */
function isRscRequest(request: Request, url: URL): boolean {
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
}

const FONT_EXTENSION = /\.(?:eot|otf|ttc|ttf|woff|woff2)$/i;

/** Cache-first with a named cache (so opt-out cleanup finds it) and a hard expiry. */
const cacheFirstWithExpiry = (cacheName: string, maxEntries: number, maxAgeDays: number) =>
  new CacheFirst({
    cacheName,
    plugins: [new ExpirationPlugin({ maxEntries, maxAgeSeconds: maxAgeDays * DAY_SECONDS, maxAgeFrom: "last-used" })],
  });

export const runtimeCaching: RuntimeCaching[] = [
  // Auth handshakes must outrank everything else: Firebase's one-shot popup
  // documents break if replayed. Rationale: lib/security/swAuthBypass.ts.
  {
    matcher: ({ url }) => isAuthRequest(url),
    handler: new NetworkOnly(),
  },
  // Personal data, API replies.
  {
    matcher: ({ url, sameOrigin }) => isApiRequest(url, sameOrigin),
    handler: new NetworkOnly(),
  },
  // Personal data, photos: optimized remote images and anything served from /api.
  {
    matcher: ({ url, sameOrigin }) => isNonLocalOptimizedImage(url, sameOrigin),
    handler: new NetworkOnly(),
  },
  // Personal data, rendered pages.
  {
    matcher: ({ request }) => isDocumentRequest(request),
    handler: new NetworkOnly(),
  },
  // Personal data, the same pages as React Server Component payloads.
  {
    matcher: ({ request, url }) => isRscRequest(request, url),
    handler: new NetworkOnly(),
  },
  // Anything from another origin: not ours to store, and not ours to vouch for.
  {
    matcher: ({ sameOrigin }) => !sameOrigin,
    handler: new NetworkOnly(),
  },

  // From here on every request is a same-origin, non-API, non-page GET.
  // Hashed build output: the file name changes when the content does.
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: cacheFirstWithExpiry("serwist-next-static", 128, 30),
  },
  // Next's image optimizer, for the site's own public art only (every other
  // source was sent to the network above).
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith(IMAGE_OPTIMIZER_PATH),
    handler: cacheFirstWithExpiry("serwist-next-image", 64, 1),
  },
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && FONT_EXTENSION.test(url.pathname),
    handler: cacheFirstWithExpiry("serwist-fonts", 8, 365),
  },
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/icons/"),
    handler: cacheFirstWithExpiry("serwist-icons", 32, 30),
  },
];
