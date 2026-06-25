import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import PosterGeneration from "@/models/PosterGeneration";
import { buildJobApplyUrl } from "@/lib/composer/branding";

/**
 * GET /api/poster/[slug]/qr
 * QR code redirect — increments qrScans and redirects to the job's apply page.
 * This URL is encoded in the poster's QR code.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.redirect(new URL("/", _req.url));
  }

  await connectDB();

  const poster = await PosterGeneration.findOneAndUpdate(
    { shareSlug: slug },
    { $inc: { "analytics.qrScans": 1 } },
    { projection: { jobId: 1 } },
  ).lean();

  if (!poster) {
    return NextResponse.redirect(new URL("/", _req.url));
  }

  const applyUrl = buildJobApplyUrl(poster.jobId.toString());
  return NextResponse.redirect(new URL(applyUrl, _req.url));
}
