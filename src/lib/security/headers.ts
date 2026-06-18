/**
 * Security headers applied to all responses via middleware.
 * Covers OWASP recommended headers for web applications.
 *
 * For page responses a per-request nonce is used in script-src so that
 * Next.js can attach the nonce to its own generated inline scripts
 * (hydration, RSC payload, etc.).  API responses use the static headers.
 */

const SHARED_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  // SECURITY (W4-3): preload added — eligibility already met (max-age >= 1y +
  // includeSubDomains). Enables HSTS preload-list submission for HTTPS-only.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
};

/**
 * Returns security headers with a nonce embedded in script-src.
 * `'strict-dynamic'` lets scripts loaded by a nonce-trusted script load
 * further scripts without needing to be explicitly whitelisted.
 */
export function getSecurityHeaders(nonce: string): Record<string, string> {
  const isDev = process.env.NODE_ENV === "development";
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      isDev
        ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
        : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,
      // SECURITY (W4-2): 'unsafe-inline' is required here because React emits
      // inline style= attributes (style-src-attr only accepts 'unsafe-inline',
      // never a nonce) and Next.js injects non-nonced inline <style> tags.
      // TODO: drop 'unsafe-inline' once all inline styles are extracted to CSS.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "media-src 'self' data:",
      // 'data:' is required so @react-pdf/renderer can fetch its yoga-layout
      // WASM module (delivered as a data: URI) during client-side PDF export.
      "connect-src 'self' data: https://generativelanguage.googleapis.com https://openrouter.ai https://api.anthropic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com https://*.pusher.com wss://*.pusher.com",
      "worker-src 'self' blob:",
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com https://www.youtube.com https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
    ...SHARED_HEADERS,
  };
}

/** Static headers for API routes (no inline scripts, no nonce needed). */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data: https://generativelanguage.googleapis.com https://openrouter.ai https://api.anthropic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com https://*.pusher.com wss://*.pusher.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  ...SHARED_HEADERS,
};

/**
 * Apply security headers to a Response or NextResponse.
 */
export function applySecurityHeaders(response: Response): Response {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
