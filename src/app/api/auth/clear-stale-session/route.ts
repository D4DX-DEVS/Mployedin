import { NextResponse } from "next/server";

/**
 * GET /api/auth/clear-stale-session?locale=en
 *
 * The dashboard layout lands here when the session cookie still decrypts at
 * the edge but Node auth() returns null (revoked session). A Server Component
 * cannot delete cookies, so the clear happens in this Route Handler, then it
 * redirects to the login page, which renders once instead of looping.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("locale");
  const locale = requested === "ar" ? "ar" : "en";

  const response = NextResponse.redirect(new URL(`/${locale}/login`, url));
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const name = part.trim().split("=")[0];
    if (!name || !name.includes("session-token")) continue;
    // A __Secure- cookie is only overwritten by a Secure Set-Cookie.
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      ...(name.startsWith("__Secure-") ? { secure: true } : {}),
    });
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
