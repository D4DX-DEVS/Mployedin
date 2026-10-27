import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import SavedJob from "@/models/SavedJob";
import { isValidObjectId } from "@/lib/security/sanitize";
import { seekerProfileId } from "@/lib/savedJobs/seeker";

/**
 * PUT /api/saved-jobs/[jobId] saves a job, DELETE unsaves it. Both are
 * idempotent — a double tap or two tabs cannot flip the state back the way a
 * toggle did. Returns { saved }.
 */
export const PUT = withAuth(async (_req: NextRequest, ctx, params) => {
  if (ctx.role !== "job_seeker") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const jobId = params?.jobId;
  if (!isValidObjectId(jobId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await connectDB();
  const jobSeekerId = await seekerProfileId(ctx.userId);
  if (!jobSeekerId) return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });

  // Only a live job can be saved; one saved earlier stays saved after it closes.
  const job = await Job.findOne({ _id: jobId, deletedAt: null }).select("status").lean<{ status?: string } | null>();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "active") {
    const already = await SavedJob.exists({ jobSeekerId, jobId });
    if (already) return NextResponse.json({ saved: true });
    return NextResponse.json({ error: "This job is no longer open" }, { status: 409 });
  }

  try {
    await SavedJob.updateOne(
      { jobSeekerId, jobId },
      { $setOnInsert: { jobSeekerId, jobId, savedAt: new Date() } },
      { upsert: true },
    );
  } catch (err) {
    // Two concurrent saves race on the unique index; the loser is already saved.
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return NextResponse.json({ saved: true });
});

export const DELETE = withAuth(async (_req: NextRequest, ctx, params) => {
  if (ctx.role !== "job_seeker") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const jobId = params?.jobId;
  if (!isValidObjectId(jobId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await connectDB();
  const jobSeekerId = await seekerProfileId(ctx.userId);
  if (jobSeekerId) await SavedJob.deleteOne({ jobSeekerId, jobId });
  return NextResponse.json({ saved: false });
});
