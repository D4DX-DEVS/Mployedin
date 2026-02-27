import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import BlogPost from "@/models/BlogPost";

/**
 * Public blog detail by slug — NO AUTH required.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
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
    console.error("[Public] Blog detail error:", error);
    return NextResponse.json({ error: "Failed to load blog post" }, { status: 500 });
  }
}
