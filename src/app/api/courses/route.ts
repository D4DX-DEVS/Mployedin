import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rateLimit";
import mongoose from "mongoose";

const CourseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  provider: { type: String, required: true },
  url: { type: String, required: true },
  description: String,
  duration: String,
  level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
  category: String,
  skills: [String],
  free: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const Course = mongoose.models.Course || mongoose.model("Course", CourseSchema);

/**
 * GET /api/courses — Public courses listing for job seekers
 */
export async function GET(req: NextRequest) {
  // Rate limit: 30 requests per minute per IP
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const { allowed } = await checkRateLimit(`courses:${ip}`, { limit: 30, windowSec: 60, prefix: "courses" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
  const search = url.searchParams.get("search") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const level = url.searchParams.get("level") ?? "";

  const filter: Record<string, unknown> = { isActive: true };
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { title: { $regex: safe, $options: "i" } },
      { provider: { $regex: safe, $options: "i" } },
      { skills: { $regex: safe, $options: "i" } },
    ];
  }
  if (category) filter.category = category;
  if (level) filter.level = level;

  const [items, total] = await Promise.all([
    Course.find(filter)
      .sort({ featured: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Course.countDocuments(filter),
  ]);

  return NextResponse.json({
    items: items.map((c: Record<string, unknown>) => ({
      _id: String(c._id),
      title: c.title,
      provider: c.provider,
      url: c.url,
      description: c.description,
      duration: c.duration,
      level: c.level,
      category: c.category,
      skills: c.skills,
      free: c.free,
      featured: c.featured,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
