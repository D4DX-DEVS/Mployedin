import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SavedJob from "@/models/SavedJob";

/**
 * DELETE /api/saved-jobs/[id] — unsave a job
 */
export const DELETE = withAuth(async (_req: NextRequest, ctx, params) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const deleted = await SavedJob.findOneAndDelete({
    _id: params?.id,
    jobSeekerId: ctx.userId,
  });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
