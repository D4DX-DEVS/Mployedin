import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import StaticPage from "@/models/StaticPage";
import { checkRateLimit } from "@/lib/security/rateLimit";

/**
 * Public static page by slug (privacy-policy, cookie-policy, etc) — NO AUTH required.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const { allowed } = checkRateLimit(`pages:${ip}`, { limit: 30, windowSec: 60, prefix: "pages" });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const { slug } = await params;
    await connectDB();

    const page = await StaticPage.findOne({
      slug,
      isActive: true,
    }).lean();

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return NextResponse.json({ page });
  } catch (error) {
    console.error("[Public] Static page error:", error);
    return NextResponse.json({ error: "Failed to load page" }, { status: 500 });
  }
}
