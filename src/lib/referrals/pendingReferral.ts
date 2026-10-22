import { useSyncExternalStore } from "react";
import { normalizeReferralCode } from "@/lib/referrals/url";

/**
 * A referral code (`?ref=`) the visitor arrived with, kept in this tab's memory
 * only. It is NOT written to a cookie, localStorage or sessionStorage: storing
 * it on arrival would be a non-essential identifier set before any choice
 * (UK PECR / UK GDPR). It reaches a sign-up two ways instead:
 *
 * - in the URL: links that lead to sign-up carry `?ref=` (registerHrefFor), and
 * - at the click: the sign-up page writes it into `mpl_signup_consent` when the
 *   visitor presses LinkedIn / Apple (lib/auth/signupConsent.ts).
 *
 * A full page load empties this memory. That is accepted: a visitor who wanders
 * away and back loses the code, which is the price of storing nothing.
 *
 * Only ever written from effects and event handlers, so the server's copy of the
 * module stays empty and is never shared between requests.
 */
let pending = "";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getPendingReferral(): string {
  return pending;
}

/** Remembers a valid code; anything that is not shaped like one is ignored. */
export function setPendingReferral(code: string): void {
  if (typeof window === "undefined") return;
  const next = normalizeReferralCode(code);
  if (!next || next === pending) return;
  pending = next;
  emit();
}

export function clearPendingReferral(): void {
  if (!pending) return;
  pending = "";
  emit();
}

export function subscribePendingReferral(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The code seen on this page load, "" if none. Empty on the server and while hydrating. */
export function usePendingReferral(): string {
  return useSyncExternalStore(subscribePendingReferral, getPendingReferral, () => "");
}

/** True for the key `ref`, however it is percent-encoded (`r%65f`) or `+`-spaced. */
function isRefKey(rawKey: string): boolean {
  try {
    return decodeURIComponent(rawKey.replace(/\+/g, " ")) === "ref";
  } catch {
    return false;
  }
}

/**
 * Takes `ref` out of the address bar once it has been read, so the code is not
 * left in the visible URL, browser history entry, shared link or screenshots.
 * Only the `ref` pair is removed from the raw query string: every other param
 * keeps its exact spelling (`%20`, `/`, a bare `?flag`), and so does the hash.
 *
 * `history.replaceState(null, …)`, never `router.replace` on mount (the router
 * call did not reach the address bar) and never `window.history.state` (Next's
 * patched replaceState would then skip its router sync and restore the old URL).
 * Call it through stripRefFromAddressBarSoon() from an effect: see there.
 */
export function stripRefFromAddressBar(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (!search) return;
  const pairs = search.slice(1).split("&");
  const kept = pairs.filter((pair) => !isRefKey(pair.split("=")[0]));
  if (kept.length === pairs.length) return;
  window.history.replaceState(null, "", pathname + (kept.length ? `?${kept.join("&")}` : "") + hash);
}

/**
 * Runs `run` one tick later, but only if the visitor is still on the page that
 * asked for it. The address is read again when the timer fires, so a navigation
 * that lands within the tick (a link click, router.push) is left alone instead
 * of having its new address rewritten with the old page's.
 */
function runLaterOnThisPage(run: () => void): void {
  if (typeof window === "undefined") return;
  const scheduledOn = window.location.pathname;
  window.setTimeout(() => {
    if (window.location.pathname !== scheduledOn) return;
    run();
  }, 0);
}

/**
 * Rewrites the address bar one tick later. A page's mount effect runs BEFORE
 * Next's AppRouter effect (children's effects run first), and that effect is
 * what wraps history.replaceState so an entry keeps Next's own state (`__NA`,
 * the router tree). A replaceState(null, …) made before it stores null state:
 * Back from the next page then leaves the wrong page on screen. By the next
 * task the patch is installed, and the call keeps Next's state.
 *
 * Fire-and-forget on purpose. `url` is fixed when this is called, so the write
 * is skipped if `location.pathname` has changed by the time the timer fires:
 * the visitor already left, and the new page's address is not ours to rewrite.
 * Calling it twice (React strict mode's second effect run) writes the same
 * address twice, which is harmless; an unmount in between changes nothing.
 */
export function replaceAddressBarSoon(url: string): void {
  runLaterOnThisPage(() => window.history.replaceState(null, "", url));
}

/**
 * stripRefFromAddressBar, one tick later (see replaceAddressBarSoon). The
 * address is read when the timer fires, and nothing happens if the visitor has
 * moved to another path, so a `ref` on the page they went to is left for that
 * page's own code to read. A second run finds no `ref` left and does nothing.
 */
export function stripRefFromAddressBarSoon(): void {
  runLaterOnThisPage(stripRefFromAddressBar);
}
