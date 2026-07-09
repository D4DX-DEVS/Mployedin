import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/security/ssrf";

/**
 * GET /api/proxy-image?url=<encoded-url>
 * Server-side image proxy to bypass CORS restrictions.
 * Only allows fetching from trusted image domains.
 */
const ALLOWED_HOSTS = [
  "digitaloceanspaces.com",
  "res.cloudinary.com",
  "lh3.googleusercontent.com",
  "media.licdn.com",
];

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

  // Exact host or a real subdomain (dot boundary) — never a suffix match, so
  // "evildigitaloceanspaces.com" cannot pass for "digitaloceanspaces.com".
  const isAllowed = ALLOWED_HOSTS.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith("." + host),
  );
  if (!isAllowed) {
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

    const contentType = response.headers.get("content-type") ?? "image/png";
    // Never proxy non-image content (e.g. HTML from a compromised bucket) —
    // this endpoint must not become an XSS vehicle on our origin.
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Upstream is not an image" }, { status: 502 });
    }
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }
}
