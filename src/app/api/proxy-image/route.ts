import { NextRequest, NextResponse } from "next/server";

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

  const isAllowed = ALLOWED_HOSTS.some((host) => parsed.hostname.endsWith(host));
  if (!isAllowed) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }
}
