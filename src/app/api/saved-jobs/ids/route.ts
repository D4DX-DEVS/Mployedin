import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SavedJob from "@/models/SavedJob";
import { seekerProfileId } from "@/lib/savedJobs/seeker";

/** Enough for any real shortlist; the cards only need to know which are saved. */
const MAX_IDS = 1000;

/** GET /api/saved-jobs/ids — the job ids the caller has saved, so cards can show their state. */
export const GET = withAuth(async (_req, ctx) => {
  if (ctx.role !== "job_seeker") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  const jobSeekerId = await seekerProfileId(ctx.userId);
  if (!jobSeekerId) return NextResponse.json({ ids: [] });
  const rows = await SavedJob.find({ jobSeekerId })
    .sort({ savedAt: -1 })
    .limit(MAX_IDS)
    .select("jobId")
    .lean<{ jobId: unknown }[]>();
  return NextResponse.json({ ids: rows.map((r) => String(r.jobId)) });
});
