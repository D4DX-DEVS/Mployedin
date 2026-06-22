import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { checkRateLimit } from "@/lib/security/rateLimit";
import FAQ from "@/models/FAQ";
import Banner from "@/models/Banner";
import Testimonial from "@/models/Testimonial";
import Video from "@/models/Video";
import BlogPost from "@/models/BlogPost";

/**
 * Public aggregated landing page data — NO AUTH required.
 * Returns all active CMS content for the landing page in one call.
 */
export async function GET(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const { allowed } = await checkRateLimit(`landing:${ip}`, { limit: 30, windowSec: 60, prefix: "landing" });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    await connectDB();

    const [faqs, banners, testimonials, videos, recentPosts] = await Promise.all([
      FAQ.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
      Banner.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
      Testimonial.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
      Video.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
      BlogPost.find({ isActive: true, status: "published" })
        .sort({ publishedAt: -1 })
        .limit(6)
        .select("title titleAr slug excerpt excerptAr coverImage author tags publishedAt")
        .lean(),
    ]);

    return NextResponse.json({
      faqs,
      banners,
      testimonials,
      videos,
      recentPosts,
    });
  } catch (error) {
    console.error("[Public] Landing data error:", error);
    return NextResponse.json(
      { error: "Failed to load landing page data" },
      { status: 500 }
    );
  }
}
