/**
 * The in-app path an assistant link points at, or null when it leaves the
 * site. Resolved the way the browser will resolve it — a prefix check misses
 * `/\evil.com`, which the URL parser reads as `//evil.com` — so a model-written
 * href can never pass as an in-app link (same tab, no noopener) while going
 * off-origin.
 */
export function sameOriginPath(href: string | undefined, origin: string): string | null {
  if (!href?.startsWith("/")) return null;
  try {
    const url = new URL(href, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}
