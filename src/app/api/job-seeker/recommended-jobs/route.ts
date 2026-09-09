import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import { SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import {
  buildRecommendedJobQuery,
  isRelevantJob,
  rankRecommendedJobs,
  RECOMMENDATION_POOL_SIZE,
  RECOMMENDED_JOB_SELECT,
} from "@/lib/jobRecommendations";

/**
 * GET /api/job-seeker/recommended-jobs
 *
 * Returns up to 5 recommended active jobs scored by local matching
 * (skills overlap, location match, salary range, job type).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "5");
  const itemLimit = Number.isFinite(limitParam) ? Math.max(1, Math.min(30, Math.round(limitParam))) : 5;

  const seeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select(SEEKER_MATCH_FIELDS)
    .lean();

  if (!seeker) {
    return NextResponse.json({ items: [] });
  }

  // Get IDs of jobs already applied to
  const appliedJobIds = await Application.find({ jobSeekerId: seeker._id, status: { $ne: "withdrawn" } })
    .select("jobId")
    .lean()
    .then((apps) => apps.map((a) => a.jobId));

  // Same candidate filter, pool window and ranking as the home page and the
  // feed — this route used to match countries by exact string and hard-drop
  // anything off-profile, so the "matching jobs" count it feeds the skills page
  // disagreed with the jobs the seeker could actually see.
  const query = buildRecommendedJobQuery({
    preferredCountries: seeker.preferredCountries,
    excludeJobIds: appliedJobIds,
  });

  const candidateJobs = await Job.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(RECOMMENDATION_POOL_SIZE)
    .select(RECOMMENDED_JOB_SELECT)
    .populate("employerId", "companyName logo")
    .lean();

  // Score using the shared algorithm (single source of truth), including
  // confirmed skills so the % matches every other surface.
  const seekerProfile = await effectiveSeekerProfile(ctx.userId, seeker);
  const ranked = rankRecommendedJobs(candidateJobs, seekerProfile);

  // totalMatches drives the skills page's "jobs matching your profile" figure,
  // so it counts on-profile jobs only — not the whole live pool.
  const totalMatches = ranked.filter((job) => isRelevantJob(job, seekerProfile)).length;
  const items = ranked.slice(0, itemLimit);

  return NextResponse.json({ items, totalMatches });
});
