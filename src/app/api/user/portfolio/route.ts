import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";

const PortfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  url: String,
  imageUrl: String,
  technologies: [String],
  startDate: Date,
  endDate: Date,
}, { timestamps: true });

const Portfolio = mongoose.models.Portfolio || mongoose.model("Portfolio", PortfolioSchema);

async function getHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const items = await Portfolio.find({ userId: ctx.userId }).sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json({
    items: items.map((p: Record<string, unknown>) => ({
      _id: String(p._id),
      title: p.title,
      description: p.description,
      url: p.url,
      imageUrl: p.imageUrl,
      technologies: p.technologies,
      startDate: p.startDate,
      endDate: p.endDate,
      createdAt: p.createdAt,
    })),
  });
}

async function postHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const body = await req.json();
  const { title, description, url, imageUrl, technologies, startDate, endDate } = body;

  if (!title || !description) {
    return NextResponse.json({ error: "Title and description required" }, { status: 400 });
  }

  // Validate URL if provided
  if (url && typeof url === "string") {
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid project URL" }, { status: 400 });
    }
  }

  // Limit to 20 projects
  const count = await Portfolio.countDocuments({ userId: ctx.userId });
  if (count >= 20) {
    return NextResponse.json({ error: "Maximum 20 projects allowed" }, { status: 400 });
  }

  const project = await Portfolio.create({
    userId: ctx.userId,
    title: String(title).trim(),
    description: String(description).trim(),
    url: url?.trim() || undefined,
    imageUrl: imageUrl?.trim() || undefined,
    technologies: Array.isArray(technologies) ? technologies.map((t: string) => String(t).trim()) : [],
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });

  return NextResponse.json({ success: true, project });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
