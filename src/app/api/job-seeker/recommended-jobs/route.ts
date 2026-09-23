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
  RECOMMENDATION_POOL_SIZE,
  RECOMMENDED_JOB_SELECT,
} from "@/lib/jobRecommendations";
import { scoreSeekerPool } from "@/lib/matching/seekerMatches";

/**
 * GET /api/job-seeker/recommended-jobs
 *
 * The seeker's recommended jobs — eligible and at or above the admin threshold,
 * scored by the engine the emails use — best first, up to `limit` (default 5).
 * `totalMatches` counts every recommended job in the pool.
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

  // Score with the engine, including confirmed skills, so the % matches every
  // other surface and the email.
  const seekerProfile = await effectiveSeekerProfile(ctx.userId, seeker);
  const pool = await scoreSeekerPool(seekerProfile, candidateJobs);

  // Both pages that call this present the result as "jobs matching you", so
  // it lists and counts recommended jobs only. It used to return the top of
  // the whole pool, and count anything sharing one skill as a match.
  const recommended = pool.jobs.filter((job) => job.recommended);
  const items = recommended.slice(0, itemLimit);

  return NextResponse.json({
    items,
    totalMatches: pool.recommendedCount,
    threshold: pool.threshold,
    limitingFactor: pool.limitingFactor ?? null,
  });
});
