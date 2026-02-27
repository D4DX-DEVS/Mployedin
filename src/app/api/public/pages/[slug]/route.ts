import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import StaticPage from "@/models/StaticPage";

/**
 * Public static page by slug (privacy-policy, cookie-policy, etc) — NO AUTH required.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
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
