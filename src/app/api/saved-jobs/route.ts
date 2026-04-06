import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SavedJob from "@/models/SavedJob";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

const saveJobSchema = z.object({
  jobId: z.string().min(1),
  notes: z.string().max(500).optional(),
});

/**
 * GET /api/saved-jobs — list saved jobs for the current job seeker (paginated)
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    SavedJob.find({ jobSeekerId: ctx.userId })
      .sort({ savedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("jobId", "title salary location status employerId tags")
      .lean(),
    SavedJob.countDocuments({ jobSeekerId: ctx.userId }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

/**
 * POST /api/saved-jobs — save a job
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, saveJobSchema);
  await connectDB();

  const existing = await SavedJob.findOne({
    jobSeekerId: ctx.userId,
    jobId: body.jobId,
  });

  if (existing) {
    return NextResponse.json({ error: "Job already saved" }, { status: 409 });
  }

  const saved = await SavedJob.create({
    jobSeekerId: ctx.userId,
    jobId: body.jobId,
    notes: body.notes,
  });

  return NextResponse.json(saved, { status: 201 });
});
