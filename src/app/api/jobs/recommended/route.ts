import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import { calculateMatchScore, seekerProfileFromDoc, jobProfileFromDoc, getMatchedSkills, skillsOverlap, educationRank } from "@/lib/matchScore";
import SkillConfirmation from "@/models/SkillConfirmation";

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
 *   min_score  — minimum match score filter (default 30)
 *   pool_page  — macro page number (1-based), each pool holds up to POOL_SIZE jobs
 */

const POOL_SIZE = 200;

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
  const minScore = Number(sp.get("min_score") ?? "0");
  const poolPageParam = Number(sp.get("pool_page") ?? "1");
  const poolPage = Number.isFinite(poolPageParam) ? Math.max(1, Math.round(poolPageParam)) : 1;

  const seeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("skills preferredCountries preferredRoles preferredSalary preferredJobType experience education")
    .lean();

  if (!seeker) {
    return NextResponse.json({ jobs: [], nextCursor: null, total: 0 });
  }

  const seekerProfile = seekerProfileFromDoc(seeker);

  // Merge confirmed skills from SkillConfirmation into effective skills list
  const confirmedSkills = await SkillConfirmation.find({
    userId: ctx.userId,
    status: "confirmed",
  }).select("skill").lean();

  const confirmedSet = new Set(confirmedSkills.map((c) => c.skill));
  const existingLower = new Set(seekerProfile.skills.map((s) => s.toLowerCase()));
  for (const cs of confirmedSet) {
    if (!existingLower.has(cs.toLowerCase())) {
      seekerProfile.skills.push(cs);
    }
  }

  // Exclude already-applied jobs
  const seekerId = (seeker as unknown as { _id: unknown })._id;
  const appliedJobIds = await Application.find({ jobSeekerId: seekerId })
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
    .sort({ createdAt: -1 })
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

  // Apply relevance as a soft score boost (not a hard gate) — irrelevant jobs
  // get a -20 point penalty so they sink below high-match jobs but remain
  // visible. This mirrors LinkedIn / Indeed behaviour: all active jobs show,
  // best matches appear first.
  const scoredWithBoost = scoredAll.map((job) => ({
    ...job,
    matchScore: isRelevant(job) ? job.matchScore : Math.max(0, job.matchScore - 20),
  }));

  // Apply the minimum-score filter (defaults to 0, meaning all jobs show).
  let scored = scoredWithBoost.filter((j) => j.matchScore >= minScore);
  if (scored.length === 0 && scoredWithBoost.length > 0) {
    scored = [...scoredWithBoost].sort((a, b) => b.matchScore - a.matchScore);
  }

  // Sort within pool
  if (sort === "latest") {
    scored.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === "salary") {
    scored.sort((a, b) => (b.salary?.max ?? 0) - (a.salary?.max ?? 0));
  } else {
    scored.sort((a, b) => b.matchScore - a.matchScore);
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

  // Cursor-based pagination within the pool
  let startIndex = 0;
  if (cursor) {
    const idx = scored.findIndex((j) => String(j._id) === cursor);
    if (idx !== -1) startIndex = idx + 1;
  }

  const page = scored.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < poolTotal ? String(page[page.length - 1]._id) : null;

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
});
