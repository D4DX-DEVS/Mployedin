import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import PosterGeneration from "@/models/PosterGeneration";
import { checkRateLimit } from "@/lib/security/rateLimit";

/**
 * POST /api/poster/[slug]/track
 * Increment analytics counters (views, downloads, qrScans).
 * Body: { event: "view" | "download" | "qr_scan" }
 * No auth required (public).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  // Public write — throttle per IP so the counters can't be scripted upward.
  const ip =
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const rl = await checkRateLimit(ip, { limit: 30, windowSec: 60, prefix: "poster-track" });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const event = body.event as string;
  if (!["view", "download", "qr_scan"].includes(event)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  await connectDB();

  const field = event === "qr_scan" ? "analytics.qrScans"
    : event === "download" ? "analytics.downloads"
    : "analytics.views";

  const result = await PosterGeneration.updateOne(
    { shareSlug: slug },
    { $inc: { [field]: 1 } },
  );

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Poster not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
