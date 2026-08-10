import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SavedJob from "@/models/SavedJob";
import JobSeeker from "@/models/JobSeeker";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";

/**
 * DELETE /api/saved-jobs/[id] — unsave a job
 */
export const DELETE = withAuth(async (req: NextRequest, ctx, params) => {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  // Ownership is recorded as the JobSeeker profile _id, not the User id — scoping
  // the delete by ctx.userId matched nothing, so every unsave returned 404.
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deleted = await SavedJob.findOneAndDelete({
    _id: params?.id,
    jobSeekerId: seeker._id,
  });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "saved_job.delete",
    resource: "saved_jobs",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ success: true });
});
