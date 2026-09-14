/**
 * Callback URL utilities for safe, same-origin redirect handling.
 *
 * Open-redirect defenses:
 * - Only accept paths starting with /${locale}/ (same-origin, same-app)
 * - Reject protocol-relative URLs ("//evil.com"), backslash tricks ("/\\evil.com"), absolute URLs
 * - Reject /api/* paths (internal APIs, not user-facing destinations)
 * - Run on strings only (no window.location, no new URL against the current URL)
 *   so it works in middleware, route handlers, and tests alike.
 *
 * This is the single source of truth for callback URL validation in the codebase.
 */

export const CALLBACK_PARAM = "callbackUrl";

/**
 * Extract and validate a callback URL.
 *
 * Returns the path+search+hash if and only if the callback is a SAFE SAME-ORIGIN path.
 * Otherwise returns null.
 *
 * Rejects:
 * - null, undefined, empty string
 * - Anything not starting with `/${locale}/`
 * - Protocol-relative ("//evil.com")
 * - Backslash tricks ("/\\evil.com")
 * - Absolute URLs to another origin
 * - /api/* paths
 * - Malformed strings
 *
 * @param rawCallback Raw callback from search params, or a full URL string (parsed defensively)
 * @param locale Target locale ("en" or "ar")
 * @returns Safe path (including search + hash) or null
 */
export function safeCallbackPath(rawCallback: string | null | undefined, locale: string): string | null {
  if (!rawCallback) {
    return null;
  }

  // Reject absolute URLs and protocol-relative URLs immediately
  if (rawCallback.includes("://") || rawCallback.startsWith("//")) {
    return null;
  }

  // Reject backslash tricks
  if (rawCallback.includes("\\")) {
    return null;
  }

  // Must start with /${locale}/
  const requiredPrefix = `/${locale}/`;
  if (!rawCallback.startsWith(requiredPrefix)) {
    return null;
  }

  // Reject dot-segments before the /api/ check below.
  //
  // The prefix checks here are string comparisons, but consumers hand the result
  // to `new URL(...)`, which normalises "..". Without this, "/en/../api/x" passes
  // every check above (it starts with "/en/", not "/en/api/") and then resolves
  // to "/api/x" — the exact destination this guard exists to forbid.
  const segments = rawCallback.split("/");
  if (segments.includes("..") || segments.includes(".")) {
    return null;
  }

  // Reject /api/* paths
  if (rawCallback.startsWith(`/${locale}/api/`)) {
    return null;
  }

  return rawCallback;
}

/**
 * Append a callback URL to a path.
 *
 * If callback is a non-empty string, appends ?callbackUrl=<encoded> (or & if path already has a query).
 * Otherwise returns path unchanged.
 *
 * @param path Target path (e.g., "/api/auth/post-login-redirect")
 * @param callback Callback URL to append, or null/undefined/empty string
 * @returns Path with appended callback, or path unchanged
 */
export function withCallback(path: string, callback: string | null | undefined): string {
  if (!callback) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${CALLBACK_PARAM}=${encodeURIComponent(callback)}`;
}
