import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import BlogPost from "@/models/BlogPost";
import { checkRateLimit } from "@/lib/security/rateLimit";
import logger from "@/lib/logger";

/**
 * Public blog detail by slug — NO AUTH required.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const { allowed } = await checkRateLimit(`blog-detail:${ip}`, { limit: 60, windowSec: 60, prefix: "blogd" });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const { slug } = await params;
    await connectDB();

    const post = await BlogPost.findOne({
      slug,
      isActive: true,
      status: "published",
    }).lean();

    if (!post) {
      return NextResponse.json({ error: "Blog post not found" }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    logger.error({ error }, "[Public] Blog detail error");
    return NextResponse.json({ error: "Failed to load blog post" }, { status: 500 });
  }
}
