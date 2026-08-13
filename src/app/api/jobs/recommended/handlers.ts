import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import { calculateMatchScore, jobProfileFromDoc, getMatchedSkills, skillsOverlap, educationRank, SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/jobs/recommended
 *
 * Returns job recommendations using the shared matchScore algorithm.
 * Supports hybrid pagination: cursor-based infinite scroll within pool pages.
 *
 * Query params:
 *   cursor     — last job _id from previous page (within current pool)
 *   limit      — items per infinite-scroll batch, default 10, max 20
 *   sort       — "match" (default) | "latest" | "salary"
 *   min_score  — minimum match score filter (default 0 = all jobs)
 *   pool_page  — macro page number (1-based), each pool holds up to POOL_SIZE jobs
 */

const POOL_SIZE = 200;

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const sp = req.nextUrl.searchParams;
  const cursor = sp.get("cursor") ?? null;
  const limitParam = Number(sp.get("limit") ?? "10");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(20, Math.round(limitParam))) : 10;
  const sort = sp.get("sort") ?? "match";
  const minScore = Number(sp.get("min_score") ?? "0");
  const poolPageParam = Number(sp.get("pool_page") ?? "1");
  const poolPage = Number.isFinite(poolPageParam) ? Math.max(1, Math.round(poolPageParam)) : 1;

  const seeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select(SEEKER_MATCH_FIELDS)
    .lean();

  if (!seeker) {
    return NextResponse.json({ jobs: [], nextCursor: null, total: 0 });
  }

  // Effective profile (base + confirmed skills) — shared with the dashboard
  // surfaces so every page shows the same percentage for the same job.
  const seekerProfile = await effectiveSeekerProfile(ctx.userId, seeker);

  // Exclude already-applied jobs — withdrawn applications don't count, since
  // the apply endpoints allow re-applying after a withdrawal.
  const seekerId = (seeker as unknown as { _id: unknown })._id;
  const appliedJobIds = await Application.find({ jobSeekerId: seekerId, status: { $ne: "withdrawn" } })
    .select("jobId")
    .lean()
    .then((apps) => apps.map((a) => a.jobId));

  // Base filter
  const jobQuery: Record<string, unknown> = {
    status: "active",
    _id: { $nin: appliedJobIds },
  };

  const andConditions: Record<string, unknown>[] = [
    { $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }] },
  ];

  if (seeker.preferredCountries?.length) {
    andConditions.push({
      $or: [
        { "location.country": { $in: seeker.preferredCountries } },
        { "location.isRemote": true },
      ],
    });
  }

  jobQuery.$and = andConditions;

  // Total matching jobs count (for pool page calculation)
  const totalMatchingJobs = await Job.countDocuments(jobQuery);

  // Candidate pool — fetch the current pool page slice
  const poolSkip = (poolPage - 1) * POOL_SIZE;
  const candidateJobs = await Job.find(jobQuery)
    // _id tiebreaker: jobs seeded in the same second otherwise get an arbitrary
    // order per query, so skip/limit windows shift and the same job can land in
    // two pool pages (duplicate React keys downstream).
    .sort({ createdAt: -1, _id: -1 })
    .skip(poolSkip)
    .limit(POOL_SIZE)
    .select("title description requirements salary location employerId tags createdAt expiresAt views uniqueViews")
    .populate("employerId", "companyName logo")
    .lean();

  // Score all candidates in this pool
  const scoredAll = candidateJobs.map((job) => ({
    ...job,
    matchScore: calculateMatchScore(seekerProfile, jobProfileFromDoc(job)),
    matchedSkills: getMatchedSkills(seekerProfile.skills, job.requirements?.skills ?? []),
  }));

  // Relevance filter: drop jobs completely unrelated to the seeker — no skill
  // overlap AND no role-title relevance (e.g. "Sales support staff" for a
  // MERN/UI-UX profile). Applied when the seeker has at least one signal
  // (skills or preferred roles) to compare against. Jobs requiring a
  // qualification two or more levels above the seeker's are also dropped.
  const seekerRoleList = (seekerProfile.preferredRoles ?? []).map((r) => r.toLowerCase());
  const hasSkillSignal = seekerProfile.skills.length > 0;
  const hasRoleSignal = seekerRoleList.length > 0;
  const seekerEduLevel = seekerProfile.educationLevel ?? 0;

  const isRelevant = (job: (typeof scoredAll)[number]): boolean => {
    // Hard qualification gate: e.g. job demands a master's, seeker has high school.
    const reqLevel = educationRank(job.requirements?.education);
    if (reqLevel > 0 && seekerEduLevel > 0 && reqLevel - seekerEduLevel >= 2) {
      return false;
    }
    if (!hasSkillSignal && !hasRoleSignal) return true;
    const jobSkills = job.requirements?.skills ?? [];
    const overlap = hasSkillSignal && skillsOverlap(seekerProfile.skills, jobSkills);
    const titleLower = (job.title ?? "").toLowerCase();
    const roleMatch =
      hasRoleSignal &&
      seekerRoleList.some((role) => titleLower.includes(role) || role.includes(titleLower));
    return overlap || roleMatch;
  };

  // Apply relevance as a soft RANKING penalty only — irrelevant jobs get a
  // -20 point sortScore so they sink below high-match jobs but stay visible
  // (LinkedIn / Indeed behaviour). The displayed matchScore is NOT altered so
  // the feed shows the same percentage as the dashboard and other surfaces.
  const scoredWithBoost = scoredAll.map((job) => ({
    ...job,
    sortScore: isRelevant(job) ? job.matchScore : Math.max(0, job.matchScore - 20),
  }));

  // Apply the minimum-score filter (defaults to 0, meaning all jobs show).
  let scored = scoredWithBoost.filter((j) => j.sortScore >= minScore);
  if (scored.length === 0 && scoredWithBoost.length > 0) {
    scored = [...scoredWithBoost].sort((a, b) => b.sortScore - a.sortScore);
  }

  // Sort within pool
  if (sort === "latest") {
    scored.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === "salary") {
    scored.sort((a, b) => (b.salary?.max ?? 0) - (a.salary?.max ?? 0));
  } else {
    scored.sort((a, b) => b.sortScore - a.sortScore);
  }

  const poolTotal = scored.length;
  const totalPoolPages = Math.max(1, Math.ceil(totalMatchingJobs / POOL_SIZE));

  // Aggregate signals for the dashboard stat cards (computed over the scored
  // pool so they reflect genuine profile fit, not the raw active-job count).
  const WEEK_MS = 7 * 24 * 3600_000;
  const now = Date.now();
  const matchedCount = scoredAll.filter(isRelevant).length;
  const strongMatches = scoredWithBoost.filter((j) => j.matchScore >= 80).length;
  const newThisWeek = scoredAll.filter(
    (j) => now - new Date(j.createdAt).getTime() <= WEEK_MS,
  ).length;

  // Cursor-based pagination within the pool.
  // A cursor that is no longer in the pool (job expired, filled, or filtered out
  // between requests) must end the feed — falling back to index 0 would re-serve
  // page 1 as the "next" page and duplicate every React key in the client feed.
  let startIndex = 0;
  if (cursor) {
    const idx = scored.findIndex((j) => String(j._id) === cursor);
    if (idx === -1) {
      return NextResponse.json({
        jobs: [],
        nextCursor: null,
        total: poolTotal,
        poolPage,
        totalPoolPages,
        totalJobs: totalMatchingJobs,
        matchedCount,
        strongMatches,
        newThisWeek,
      });
    }
    startIndex = idx + 1;
  }

  const page = scored.slice(startIndex, startIndex + limit);
  const nextCursor =
    page.length > 0 && startIndex + page.length < poolTotal
      ? String(page[page.length - 1]._id)
      : null;

  return NextResponse.json({
    jobs: page,
    nextCursor,
    total: poolTotal,
    poolPage,
    totalPoolPages,
    totalJobs: totalMatchingJobs,
    matchedCount,
    strongMatches,
    newThisWeek,
  });
}

export { getHandler };
