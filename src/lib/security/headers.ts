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
      // Next.js emits two deterministic framework style blocks without
      // propagating the request nonce. Permit only their exact hashes.
      isDev
        ? "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com"
        : `style-src-elem 'self' 'nonce-${nonce}' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY=' https://fonts.googleapis.com`,
      // React components still use style attributes. Isolating this permission
      // to attributes prevents it from authorizing arbitrary inline <style>.
      "style-src-attr 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://media.licdn.com https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "media-src 'self' data:",
      // 'data:' is required so @react-pdf/renderer can fetch its yoga-layout
      // WASM module (delivered as a data: URI) during client-side PDF export.
      // The Spaces origins are needed by the CV/resume viewer, which fetches the
      // stored PDF and frames it as a blob:; without them every inline preview
      // failed and fell back to a whole-tab download.
      "connect-src 'self' data: blob: https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com https://generativelanguage.googleapis.com https://openrouter.ai https://api.anthropic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com https://*.pusher.com wss://*.pusher.com",
      "worker-src 'self' blob:",
      // blob: lets the candidate CV viewer frame an in-memory PDF. The proxied
      // CV response sets X-Frame-Options: DENY / frame-ancestors 'none', so it
      // can only be embedded via a blob: URL, never by its same-origin URL.
      "frame-src 'self' blob: https://*.firebaseapp.com https://accounts.google.com https://www.google.com https://www.youtube.com https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com",
      // object-src is required so the resource/document PDF preview <embed> can
      // load from our own Spaces CDN. Without it, <embed> falls back to
      // default-src 'self' and the preview renders blank.
      "object-src 'self' blob: https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com",
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
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://media.licdn.com https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data: blob: https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com https://generativelanguage.googleapis.com https://openrouter.ai https://api.anthropic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com https://*.pusher.com wss://*.pusher.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com; object-src 'self' blob: https://*.digitaloceanspaces.com https://*.cdn.digitaloceanspaces.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
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
