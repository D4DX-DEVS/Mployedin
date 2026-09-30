"use client";

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function getCsrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match?.split("=")[1] ?? "";
}

/**
 * The CSRF cookie expires after 2h. A tab left open longer (e.g. a job seeker
 * slowly filling Easy Apply) would send an empty token and get a 403
 * "token expired/missing". Any page GET makes the middleware set a fresh
 * cookie, so refresh it transparently before the mutating request.
 */
async function ensureCsrfToken(): Promise<string> {
  let token = getCsrfToken();
  if (!token) {
    try {
      await fetch(window.location.pathname, { credentials: "same-origin" });
    } catch {
      /* offline — the request below will fail with a network error anyway */
    }
    token = getCsrfToken();
  }
  return token;
}

/**
 * The token belongs to our API only. Stamping it on a third-party request
 * leaks it, and Google rejects the unknown header at preflight (403, no CORS
 * headers) — that is what broke Firebase Google sign-in on the auth pages.
 */
function isSameOrigin(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Fetch wrapper that automatically includes the CSRF token header
 * on same-origin state-mutating requests (POST, PATCH, PUT, DELETE).
 */
export function csrfFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();

  if (MUTATING_METHODS.has(method) && isSameOrigin(input)) {
    return ensureCsrfToken().then((token) => {
      const headers = new Headers(init?.headers);
      if (!headers.has(CSRF_HEADER)) {
        headers.set(CSRF_HEADER, token);
      }
      return fetch(input, { ...init, headers });
    });
  }

  return fetch(input, init);
}

let patched = false;

/**
 * Monkey-patch the global fetch to auto-inject the CSRF token.
 * Safe to call multiple times — only patches once.
 */
export function installCsrfFetch(): void {
  if (patched || typeof window === "undefined") return;
  patched = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = function csrfPatchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? "GET").toUpperCase();

    if (MUTATING_METHODS.has(method) && isSameOrigin(input)) {
      // ensureCsrfToken's own page GET goes through the non-mutating branch —
      // no recursion.
      return ensureCsrfToken().then((token) => {
        const headers = new Headers(init?.headers);
        if (!headers.has(CSRF_HEADER)) {
          headers.set(CSRF_HEADER, token);
        }
        return originalFetch(input, { ...init, headers });
      });
    }

    return originalFetch(input, init);
  } as typeof window.fetch;
}
