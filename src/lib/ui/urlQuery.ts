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
 * the browser catches up. It also records the address the write started from:
 * once the browser shows anything other than that or the write itself, someone
 * navigated (a tab link, back), and the browser is the truth again. Without
 * that, the page-1 reset every list does on mount — a write that leaves the URL
 * as it is — hid the next link click on the deployed build: Agent → Job seekers
 * → "In my area" changed the address but the list stayed on "All".
 */

let pending: { pathname: string; from: string; search: string } | null = null;

/** The query string as it will be, including writes the browser hasn't applied yet. */
export function readQuery(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  if (
    pending &&
    pending.pathname === window.location.pathname &&
    pending.from === window.location.search &&
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
    // A write that leaves the address as it is has nothing to wait for.
    const from = window.location.search;
    pending = search === from ? null : { pathname: window.location.pathname, from, search };
  }
  // An empty query still needs a target: the bare pathname clears the string.
  replace(search || (typeof window !== "undefined" ? window.location.pathname : "?"));
}
