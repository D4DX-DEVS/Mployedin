import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Empties the caller's browser HTTP cache. Sign-out calls this.
 *
 * Authenticated API routes reply with `Cache-Control: private, max-age=...`, so
 * the browser keeps the signed-in person's lists after they sign out and serves
 * them again offline or from a back navigation. `Clear-Site-Data: "cache"` makes
 * the browser drop everything it cached for this origin.
 *
 * No auth: it only clears the caller's own browser, reads nothing and changes
 * nothing on the server. It stays behind the normal CSRF check (not exempted in
 * `isCsrfExempt`), so a cross-site page cannot make visitors lose their cache.
 */
export function POST() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Clear-Site-Data": '"cache"',
      "Cache-Control": "no-store",
    },
  });
}
