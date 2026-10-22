/**
 * Names of the browser caches this site's service worker has ever written.
 *
 * Kept free of any `serwist` import so client code (sign-out cleanup, the
 * registration component) can use it without pulling the worker library into
 * the page bundle. The worker's own rules live in `./runtimeCaching.ts`.
 */

/**
 * Runtime caches written by `@serwist/next`'s `defaultCache`. They held every
 * same-origin GET /api/* reply, every page and RSC payload, and every
 * cross-origin response for up to 24 hours — including admin lists with email
 * addresses, readable offline after sign-out. Nothing writes to them any more;
 * the worker deletes them on activate and the page deletes them on devices
 * whose worker has not updated yet.
 */
export const LEGACY_RUNTIME_CACHES: readonly string[] = [
  "apis",
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
  "cross-origin",
  "next-data",
  "static-data-assets",
];

/**
 * Image caches from the same old `defaultCache`. `next-image` (24 hours) held
 * every image Next's optimizer served, including remote avatars, logos and
 * candidate photos; `static-image-assets` (30 days) held every same-origin
 * image file. Nothing writes to them any more, but they stay on devices that
 * keep the worker, so those devices delete them too.
 */
export const LEGACY_IMAGE_CACHES: readonly string[] = ["next-image", "static-image-assets"];

/** Every old cache that may hold personal data and is deleted wherever the worker stays. */
export const LEGACY_PERSONAL_DATA_CACHES: readonly string[] = [...LEGACY_RUNTIME_CACHES, ...LEGACY_IMAGE_CACHES];

/**
 * The rest of the old `defaultCache`: fonts, scripts, styles, audio and video.
 * Only ever files, so a device that keeps the worker has no reason to purge
 * them, but a device that never opts in has no use for them.
 */
const LEGACY_STATIC_CACHES: readonly string[] = [
  "next-static-js-assets",
  "google-fonts-webfonts",
  "google-fonts-stylesheets",
  "static-font-assets",
  "static-audio-assets",
  "static-video-assets",
  "static-js-assets",
  "static-style-assets",
];

/** Serwist's precache and every cache the current rules write start with this. */
export const SERWIST_CACHE_PREFIX = "serwist-";

/** IndexedDB database Serwist's ExpirationPlugin keeps its bookkeeping in. */
export const SERWIST_EXPIRATION_DB = "serwist-expiration";

/**
 * True only for caches this site's worker created. A device can hold other
 * caches on the same origin (a library, a dev tool); those are not ours to wipe.
 */
export function isKnownServiceWorkerCache(name: string): boolean {
  return (
    name.startsWith(SERWIST_CACHE_PREFIX) ||
    LEGACY_PERSONAL_DATA_CACHES.includes(name) ||
    LEGACY_STATIC_CACHES.includes(name)
  );
}
