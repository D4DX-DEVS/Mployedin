import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";

/**
 * POST /api/admin/jobs/[id]/feature — Mark/unmark a job as featured
 */
export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json();
  const { featured, days } = body as { featured: boolean; days?: number };

  const job = await Job.findById(params?.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (featured) {
    const featuredUntil = new Date(Date.now() + (days ?? 30) * 24 * 60 * 60 * 1000);
    job.isFeatured = true;
    job.featuredUntil = featuredUntil;
    await job.save();
    return NextResponse.json({ success: true, featuredUntil });
  } else {
    job.isFeatured = false;
    job.featuredUntil = undefined;
    await job.save();
    return NextResponse.json({ success: true, message: "Job unfeatured" });
  }
}, { resource: "jobs", action: "update" });
