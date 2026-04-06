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
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
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
        : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.pusher.com wss://*.pusher.com",
      "frame-ancestors 'none'",
    ].join("; "),
    ...SHARED_HEADERS,
  };
}

/** Static headers for API routes (no inline scripts, no nonce needed). */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.pusher.com wss://*.pusher.com; frame-ancestors 'none'",
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
