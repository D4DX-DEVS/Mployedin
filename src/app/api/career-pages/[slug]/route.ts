import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import CareerPage from "@/models/CareerPage";
import Job from "@/models/Job";

// Public route - renders career page by slug
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  await connectDB();

  const page = await CareerPage.findOne({ slug, isPublished: true })
    .populate("employerId", "companyName logo industry location")
    .lean();

  if (!page) return NextResponse.json({ error: "Career page not found" }, { status: 404 });

  // Increment view count
  await CareerPage.updateOne({ _id: page._id }, { $inc: { "analytics.views": 1 } });

  // Get active jobs for this employer
  const jobs = await Job.find({ employerId: page.employerId, status: "active" })
    .select("title location jobType salary skills createdAt")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return NextResponse.json({ page, jobs });
}
