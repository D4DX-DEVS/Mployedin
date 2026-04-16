import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SavedJob from "@/models/SavedJob";
import JobSeeker from "@/models/JobSeeker";
import { isValidObjectId } from "@/lib/security/sanitize";

/**
 * POST /api/jobs/[id]/save
 *
 * Toggles save state for a job.
 * Returns { saved: boolean }
 */
export const POST = withAuth(async (_req: NextRequest, ctx, params) => {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobId = params!.id;

  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker) {
    return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });
  }

  const existing = await SavedJob.findOne({ jobSeekerId: seeker._id, jobId }).lean();

  if (existing) {
    await SavedJob.deleteOne({ _id: existing._id });
    return NextResponse.json({ saved: false });
  }

  await SavedJob.create({ jobSeekerId: seeker._id, jobId, savedAt: new Date() });
  return NextResponse.json({ saved: true }, { status: 201 });
});
