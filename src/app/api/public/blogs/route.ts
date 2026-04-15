import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import BlogPost from "@/models/BlogPost";
import { escapeRegex } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rateLimit";

/**
 * Public blog listing — NO AUTH required.
 */
export async function GET(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const { allowed } = checkRateLimit(`blogs:${ip}`, { limit: 60, windowSec: 60, prefix: "blogs" });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const tag = searchParams.get("tag") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") ?? "9")));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { isActive: true, status: "published" };

    if (tag) query.tags = tag;

    if (search) {
      const safe = escapeRegex(search);
      query.$or = [
        { title: { $regex: safe, $options: "i" } },
        { titleAr: { $regex: safe, $options: "i" } },
        { excerpt: { $regex: safe, $options: "i" } },
        { tags: { $regex: safe, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      BlogPost.find(query)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("title titleAr slug excerpt excerptAr coverImage author tags publishedAt")
        .lean(),
      BlogPost.countDocuments(query),
    ]);

    return NextResponse.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[Public] Blog listing error:", error);
    return NextResponse.json({ error: "Failed to load blog posts" }, { status: 500 });
  }
}
