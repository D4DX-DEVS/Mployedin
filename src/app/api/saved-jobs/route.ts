import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SavedJob from "@/models/SavedJob";
import JobSeeker from "@/models/JobSeeker";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

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

  // SavedJob.jobSeekerId holds the JobSeeker profile _id (that is what
  // POST /api/jobs/[id]/save writes), not the User id — querying by ctx.userId
  // silently matched nothing and this endpoint always returned an empty list.
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker) {
    return NextResponse.json({ items: [], total: 0, page, totalPages: 0 });
  }

  const [items, total] = await Promise.all([
    SavedJob.find({ jobSeekerId: seeker._id })
      .sort({ savedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("jobId", "title salary location status employerId tags")
      .lean(),
    SavedJob.countDocuments({ jobSeekerId: seeker._id }),
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

  // Must key on the JobSeeker profile _id so this stays consistent with
  // POST /api/jobs/[id]/save, the dashboard counters and the saved-jobs list.
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker) {
    return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });
  }

  let saved;
  try {
    saved = await SavedJob.create({
      jobSeekerId: seeker._id,
      jobId: body.jobId,
      notes: body.notes,
    });
  } catch (err: unknown) {
    const error = err as Record<string, unknown>;
    if ((error.code as number) === 11000) {
      return NextResponse.json({ error: "Job already saved" }, { status: 409 });
    }
    throw err;
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "saved_job.create",
    resource: "saved_jobs",
    resourceId: String(saved._id),
    meta: { jobId: body.jobId },
    req,
  });

  return NextResponse.json(saved, { status: 201 });
});
