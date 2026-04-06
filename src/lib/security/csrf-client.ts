"use client";

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function getCsrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match?.split("=")[1] ?? "";
}

/**
 * Fetch wrapper that automatically includes the CSRF token header
 * on state-mutating requests (POST, PATCH, PUT, DELETE).
 */
export function csrfFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();

  if (MUTATING_METHODS.has(method)) {
    const headers = new Headers(init?.headers);
    if (!headers.has(CSRF_HEADER)) {
      headers.set(CSRF_HEADER, getCsrfToken());
    }
    return fetch(input, { ...init, headers });
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

    if (MUTATING_METHODS.has(method)) {
      const headers = new Headers(init?.headers);
      if (!headers.has(CSRF_HEADER)) {
        headers.set(CSRF_HEADER, getCsrfToken());
      }
      return originalFetch(input, { ...init, headers });
    }

    return originalFetch(input, init);
  } as typeof window.fetch;
}
