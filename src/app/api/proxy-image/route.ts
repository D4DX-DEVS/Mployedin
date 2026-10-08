import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/security/ssrf";

/**
 * GET /api/proxy-image?url=<encoded-url>
 * Server-side image proxy to bypass CORS restrictions.
 *
 * Pinned to OUR bucket's host(s) only. A suffix allow-list such as
 * "digitaloceanspaces.com" admitted any tenant's Spaces bucket, so an attacker
 * could host content there and have it served from our origin.
 */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      hosts.add(new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase());
    } catch {
      // Ignore malformed env values.
    }
  };
  add(process.env.DO_SPACES_CDN_ENDPOINT);
  add(process.env.SPACES_PUBLIC_HOST);
  const endpoint = process.env.SPACES_ENDPOINT;
  const bucket = process.env.SPACES_BUCKET_NAME ?? process.env.DO_SPACES_BUCKET;
  if (endpoint && bucket) add(`${bucket}.${endpoint}`);
  return hosts;
}

// Raster formats only. SVG can carry <script>, and this proxy serves same-origin.
const SAFE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Security: only allow HTTPS from trusted hosts
  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTPS URLs allowed" }, { status: 400 });
  }

  // Exact host match against the configured bucket host(s) only.
  if (!allowedHosts().has(parsed.hostname.toLowerCase())) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
  }

  // Defence in depth: reject if the allowed host resolves to a private IP.
  try {
    await assertPublicUrl(url);
  } catch {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "image/*" },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    // Never proxy non-image content (HTML, SVG) — this endpoint must not become
    // an XSS vehicle on our origin.
    if (!SAFE_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Upstream is not an allowed image type" }, { status: 415 });
    }
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'inline; filename="image"',
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }
}
