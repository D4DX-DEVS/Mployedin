/**
 * Shared read/write of the current query string.
 *
 * Two independent hooks write it in the same tick: changing a filter also
 * resets pagination to page 1. `router.replace` does not update
 * `window.location.search` synchronously, so whichever writer ran second used
 * to read the pre-navigation string and silently drop the first writer's
 * param — a status filter would land in the URL and vanish a moment later.
 *
 * This module remembers the string we last asked for and hands that back until
 * the browser catches up. The pathname is recorded alongside it so a real
 * navigation to another page starts from the browser's truth again.
 */

let pending: { pathname: string; search: string } | null = null;

/** The query string as it will be, including writes the browser hasn't applied yet. */
export function readQuery(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  if (
    pending &&
    pending.pathname === window.location.pathname &&
    pending.search !== window.location.search
  ) {
    return new URLSearchParams(pending.search);
  }
  pending = null;
  return new URLSearchParams(window.location.search);
}

/**
 * Replace the query string. `replace` is the caller's `router.replace` so this
 * module stays free of the router import and testable on its own.
 */
export function writeQuery(params: URLSearchParams, replace: (href: string) => void): void {
  const qs = params.toString();
  const search = qs ? `?${qs}` : "";
  if (typeof window !== "undefined") {
    pending = { pathname: window.location.pathname, search };
  }
  // An empty query still needs a target: the bare pathname clears the string.
  replace(search || (typeof window !== "undefined" ? window.location.pathname : "?"));
}
