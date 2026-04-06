/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * - On GET requests to protected pages, a random CSRF token is set as a cookie.
 * - On POST/PATCH/DELETE requests, the client must send the token in the
 *   `x-csrf-token` header (or `_csrf` body field).
 * - The middleware compares the cookie token to the header token.
 *
 * This is compatible with Next.js middleware (Edge Runtime).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";
const TOKEN_LENGTH = 32;

/**
 * Generate a cryptographically random hex token.
 * Uses Web Crypto API (available in Edge Runtime).
 */
function generateToken(): string {
  const buffer = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Set a CSRF cookie on the response if one doesn't already exist.
 * Call this for GET requests to pages.
 */
export function setCsrfCookie(response: NextResponse, request: NextRequest): NextResponse {
  const existingToken = request.cookies.get(CSRF_COOKIE)?.value;
  if (!existingToken) {
    const token = generateToken();
    response.cookies.set(CSRF_COOKIE, token, {
      httpOnly: false, // Client JS needs to read it for the header
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 2, // 2 hours
    });
  }
  return response;
}

/**
 * Validate CSRF token on state-changing requests.
 * Returns null if valid, or a 403 NextResponse if invalid.
 */
export function validateCsrf(request: NextRequest): NextResponse | null {
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);

  if (!cookieToken || !headerToken) {
    return NextResponse.json(
      { error: "Missing CSRF token" },
      { status: 403 }
    );
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(cookieToken, headerToken)) {
    return NextResponse.json(
      { error: "Invalid CSRF token" },
      { status: 403 }
    );
  }

  return null; // Valid
}

/**
 * Constant-time string comparison (Edge-compatible).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Routes exempt from CSRF (e.g., NextAuth callbacks, public APIs).
 */
const CSRF_EXEMPT_PREFIXES = [
  "/api/auth/", // NextAuth handles its own CSRF
  "/api/public/",
  "/api/contact",
  "/api/cron/",
  "/api/filters",
];

/**
 * Check if a path is exempt from CSRF protection.
 */
export function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
