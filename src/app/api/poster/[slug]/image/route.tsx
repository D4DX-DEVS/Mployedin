import { NextRequest, NextResponse } from "next/server";
import { parsePosterSize, renderBrandPosterImage } from "@/lib/poster/renderBrandPoster.server";
import { gatePosters } from "@/lib/features/posterGate";
import logger from "@/lib/logger";

export const runtime = "nodejs";

/**
 * GET /api/poster/[slug]/image?size=square|story|landscape|a4&download=1
 *
 * A saved brand poster as a PNG. Public like the share page it belongs to (the
 * slug is the capability).
 */
async function handler(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const size = parsePosterSize(req.nextUrl.searchParams.get("size"));

  try {
    const image = await renderBrandPosterImage(slug, size);
    if (!image) return NextResponse.json({ error: "Poster not found" }, { status: 404 });
    const headers = new Headers(image.headers);
    headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    if (req.nextUrl.searchParams.get("download") === "1") {
      headers.set("Content-Disposition", `attachment; filename="mployedin-poster-${slug}-${size}.png"`);
    }
    return new Response(image.body, { status: 200, headers });
  } catch (err) {
    logger.error({ err, slug, size }, "[poster] brand poster image failed");
    return NextResponse.json({ error: "The poster image couldn't be drawn" }, { status: 500 });
  }
}

export const GET = gatePosters(handler);
