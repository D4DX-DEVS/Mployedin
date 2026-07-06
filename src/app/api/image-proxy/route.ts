import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/image-proxy?url=<encoded>
 * Streams a remote image from the same origin so it can be drawn onto a <canvas>
 * (html-to-image poster export) without cross-origin taint. DigitalOcean Spaces does
 * not send Access-Control-Allow-Origin, so direct crossOrigin loads fail.
 *
 * Host-locked to DO Spaces to avoid being an open SSRF proxy. Public GET, images only.
 */
const ALLOWED_HOST_SUFFIX = ".digitaloceanspaces.com";

// Raster formats only. SVG is explicitly excluded — it can carry <script> and this
// proxy serves same-origin, so a hostile SVG in any Spaces bucket would be XSS.
const SAFE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  // Pin to the exact bucket host when configured; else fall back to the Spaces suffix.
  const pinnedHost = process.env.SPACES_PUBLIC_HOST;
  const hostOk = pinnedHost ? parsed.hostname === pinnedHost : parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX);
  if (parsed.protocol !== "https:" || !hostOk) {
    return new NextResponse("Forbidden host", { status: 403 });
  }

  // Do not follow redirects — a 3xx hop could bypass the host allowlist and reach an
  // internal address (SSRF). The allowlisted host serves images directly with 200.
  const upstream = await fetch(parsed.toString(), { redirect: "manual" });
  if (upstream.status >= 300 && upstream.status < 400) {
    return new NextResponse("Redirects not allowed", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Upstream fetch failed", { status: 502 });
  }

  const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!SAFE_TYPES.has(contentType)) {
    return new NextResponse("Not an allowed image type", { status: 415 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
      "Access-Control-Allow-Origin": "*",
      // Defense in depth: never sniff, never execute, render inline only.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'inline; filename="image"',
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
