"use client";

import { setNonce } from "get-nonce";

interface CspNonceProviderProps {
  /** Per-request nonce minted by the middleware; undefined if none was set. */
  nonce?: string;
}

/**
 * Hands the request's CSP nonce to the runtime style injectors.
 *
 * Production CSP sets `style-src-elem 'self' 'nonce-…'` with no
 * 'unsafe-inline' (see `lib/security/headers.ts`), so a `<style>` element
 * created at runtime is blocked unless it carries the nonce. Radix builds its
 * scroll lock that way — `react-remove-scroll-bar` → `react-style-singleton` —
 * and that library asks the `get-nonce` module for the value.
 *
 * `get-nonce` checks `setNonce()` first and only then falls back to the free
 * `__webpack_nonce__` variable. The fallback is unreachable from application
 * code: webpack rewrites that identifier to `__webpack_require__.nc` at build
 * time, so assigning `window.__webpack_nonce__` from a plain inline script
 * never reaches it. Calling `setNonce` from a bundled client module is the
 * path that actually works, and it works under Turbopack too.
 *
 * Set during render rather than in an effect so the value is in place before
 * any child's effect can open a dialog and inject a style. Browser-only:
 * `setNonce` writes a module-level global, which on the server would outlive
 * the request and bleed one visitor's nonce into another's render. Nothing
 * reads it server-side anyway — the injectors only run against a real DOM.
 */
export function CspNonceProvider({ nonce }: CspNonceProviderProps) {
  if (nonce && typeof window !== "undefined") setNonce(nonce);
  return null;
}
