import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import { calculateMatchScore, seekerProfileFromDoc, jobProfileFromDoc } from "@/lib/matchScore";

/**
 * GET /api/jobs/recommended
 *
 * Returns job recommendations using the shared matchScore algorithm.
 * Supports cursor-based pagination and 3 sort modes.
 *
 * Query params:
 *   cursor  — last job _id from previous page
 *   limit   — default 10, max 20
 *   sort    — "match" (default) | "latest" | "salary"
 *   min_score — minimum match score filter (default 50)
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const sp = req.nextUrl.searchParams;
  const cursor = sp.get("cursor") ?? null;
  const limitParam = Number(sp.get("limit") ?? "10");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(20, Math.round(limitParam))) : 10;
  const sort = sp.get("sort") ?? "match";
  const minScore = Number(sp.get("min_score") ?? "50");

  const seeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("skills preferredCountries preferredRoles preferredSalary preferredJobType experience")
    .lean();

  if (!seeker) {
    return NextResponse.json({ jobs: [], nextCursor: null, total: 0 });
  }

  const seekerProfile = seekerProfileFromDoc(seeker);

  // Exclude already-applied jobs
  const appliedJobIds = await Application.find({ jobSeekerId: ctx.userId })
    .select("jobId")
    .lean()
    .then((apps) => apps.map((a) => a.jobId));

  // Base filter
  const jobQuery: Record<string, unknown> = {
    status: "active",
    _id: { $nin: appliedJobIds },
    $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
  };

  if (seeker.preferredCountries?.length) {
    jobQuery["$or"] = [
      { "location.country": { $in: seeker.preferredCountries } },
      { "location.isRemote": true },
    ];
  }

  // Candidate pool — larger pool so we can score then paginate
  const candidateJobs = await Job.find(jobQuery)
    .sort({ createdAt: -1 })
    .limit(200)
    .select("title requirements salary location employerId tags createdAt")
    .populate("employerId", "companyName logo")
    .lean();

  // Score all candidates
  const scored = candidateJobs
    .map((job) => ({
      ...job,
      matchScore: calculateMatchScore(seekerProfile, jobProfileFromDoc(job)),
    }))
    .filter((j) => j.matchScore >= minScore);

  // Sort
  if (sort === "latest") {
    scored.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === "salary") {
    scored.sort((a, b) => (b.salary?.max ?? 0) - (a.salary?.max ?? 0));
  } else {
    scored.sort((a, b) => b.matchScore - a.matchScore);
  }

  const total = scored.length;

  // Cursor-based pagination — find cursor position
  let startIndex = 0;
  if (cursor) {
    const idx = scored.findIndex((j) => String(j._id) === cursor);
    if (idx !== -1) startIndex = idx + 1;
  }

  const page = scored.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < total ? String(page[page.length - 1]._id) : null;

  return NextResponse.json({ jobs: page, nextCursor, total });
});
