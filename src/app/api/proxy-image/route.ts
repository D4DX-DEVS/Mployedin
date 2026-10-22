import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/security/ssrf";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { FALLBACK_CLIENT, getClientIp } from "@/lib/security/clientIp";
import logger from "@/lib/logger";
import { isProviderAvatarHost, readCapped } from "@/lib/images/providerAvatarHosts.mjs";

/**
 * GET /api/proxy-image?url=<encoded-url>
 *
 * Serves a Google or LinkedIn profile photo from our own origin, so the
 * visitor's browser never contacts the provider (their IP address and browser
 * details would go to a third party on page view). Nothing else: our own
 * Spaces images load directly under the CSP, and a proxy that fetched any
 * bucket would be an open relay.
 *
 * Public on purpose. Profile photos also appear on public pages (reviews,
 * testimonials, public profiles), so there is no session check. The limits that
 * stand in for one: provider hosts only, https only, a site-wide rate limit plus
 * one per client, at most MAX_IN_FLIGHT upstream fetches at a time, a 5 MB cap,
 * raster images only, and a response built from scratch (nothing the upstream
 * sends is forwarded).
 *
 * No Content-Security-Policy here: src/proxy.ts replaces whatever a route sets
 * with the API policy on the way out. What keeps a response from running
 * anything is that SVG is refused and the content type is pinned with nosniff.
 */

/**
 * Charged on EVERY request, before any per-client state exists. Wherever the
 * client address comes from a header the edge does not overwrite, a caller that
 * sends a new value each time gets a fresh per-client bucket each time and
 * never meets PER_CLIENT_LIMIT; this one cannot be dodged by choosing an
 * address. It also covers visitors getClientIp can only call FALLBACK_CLIENT
 * (no trusted client-IP source configured): they share this bucket instead of
 * a smaller one that a single client could empty to lock the rest out.
 */
const SITE_LIMIT = { limit: 3000, windowSec: 60, prefix: "proxy-image-site" };
const SITE_KEY = "all";
/** Fair share for one address getClientIp trusts. */
const PER_CLIENT_LIMIT = { limit: 120, windowSec: 60, prefix: "proxy-image" };

/**
 * Requests this instance works on at once, from the slot taken just before the
 * DNS check until the response is built. Each can hold up to 5 MB, so the bound
 * is also a memory bound. Beyond it the answer is 503, given before any DNS
 * lookup, and the browser shows the initials, as for any other failed photo.
 */
const MAX_IN_FLIGHT = 20;
let inFlight = 0;

const MAX_URL_LENGTH = 2048;
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * Raster formats only. SVG is refused, not sandboxed: it can carry script and
 * this answers on our origin, and no provider serves an avatar as SVG.
 */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

function fail(error: string, status: number, extraHeaders: Record<string, string> = {}): NextResponse {
  // An error must never be kept by a browser or CDN as if it were the photo.
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

const TRY_AGAIN = "We couldn't load that image right now. Please try again shortly.";

/** A refusal that tells the browser when to come back. */
function retryLater(status: 429 | 503, retryAfterSec: number): NextResponse {
  return fail(TRY_AGAIN, status, { "Retry-After": String(Math.max(1, retryAfterSec)) });
}

/** The name of whatever was thrown (TimeoutError, TypeError, ...): never its message, which can carry the address. */
function errorName(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && name ? name : "UnknownError";
}

/** Why an upstream attempt failed, for the log: the provider host and a short reason, never the address. */
function logUpstreamFailure(host: string, detail: { error?: string; status?: number; reason?: string }): void {
  logger.warn({ host, ...detail }, "proxy-image: upstream request failed");
}

export async function GET(req: NextRequest) {
  const site = await checkRateLimit(SITE_KEY, SITE_LIMIT);
  if (!site.allowed) return retryLater(429, Math.ceil((site.resetAt - Date.now()) / 1000));

  const client = getClientIp(req.headers);
  if (client !== FALLBACK_CLIENT) {
    const own = await checkRateLimit(client, PER_CLIENT_LIMIT);
    if (!own.allowed) return retryLater(429, Math.ceil((own.resetAt - Date.now()) / 1000));
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url || url.length > MAX_URL_LENGTH) {
    return fail("The image address is missing or invalid.", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail("The image address is missing or invalid.", 400);
  }

  if (parsed.protocol !== "https:") {
    return fail("Only https image addresses are allowed.", 400);
  }

  // Provider avatar hosts only: the exact host or a real subdomain (dot
  // boundary), never a suffix match. No credentials and no other port, so the
  // URL can only ever mean "that provider's image server".
  if (!isProviderAvatarHost(parsed.hostname) || parsed.username || parsed.password || parsed.port) {
    return fail("That image host isn't allowed.", 403);
  }

  // Shed load before any DNS work: a request that cannot be served now must not
  // cost a lookup either. Only a request for an allowed provider host gets this
  // far, and from here to the end the slot is returned in `finally`, whichever
  // way the request leaves (DNS refusal, throw, timeout, non-image, served).
  if (inFlight >= MAX_IN_FLIGHT) return retryLater(503, 2);
  inFlight++;
  const host = parsed.hostname;
  try {
    // Defence in depth: reject if the allowed host resolves to a private IP.
    try {
      await assertPublicUrl(url);
    } catch {
      return fail("That image host isn't allowed.", 403);
    }

    const response = await fetch(url, {
      headers: { Accept: "image/*" },
      // A 3xx hop could leave the allow-list; the provider serves avatars directly.
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      logUpstreamFailure(host, { status: response.status });
      return fail("We couldn't load that image.", 502);
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      logUpstreamFailure(host, { reason: "not a supported image type" });
      return fail("That file isn't a supported image.", 415);
    }

    const body = await readCapped(response);
    if (!body) {
      logUpstreamFailure(host, { reason: "image over the size cap" });
      return fail("That image is too large to show.", 413);
    }
    if (body.byteLength === 0) {
      logUpstreamFailure(host, { reason: "empty image" });
      return fail("We couldn't load that image.", 502);
    }

    // Built from scratch: not one upstream header (Set-Cookie included) is
    // forwarded, and there is no Access-Control-Allow-Origin, so only our own
    // pages can read these bytes.
    return new NextResponse(body as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // private: this app's auth wrapper adds its own cookies to every response
        // (authjs.csrf-token), and a shared cache must never store those.
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logUpstreamFailure(host, { error: errorName(error) });
    return fail("We couldn't load that image.", 502);
  } finally {
    inFlight--;
  }
}
