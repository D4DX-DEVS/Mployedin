import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";

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
    .select("skills preferredCountries preferredRoles preferredSalary preferredJobType")
    .lean();

  if (!seeker) {
    return NextResponse.json({ items: [] });
  }

  // Get IDs of jobs already applied to
  const appliedJobIds = await Application.find({ jobSeekerId: seeker._id })
    .select("jobId")
    .lean()
    .then((apps) => apps.map((a) => a.jobId));

  // Build query: active jobs NOT already applied to
  const query: Record<string, unknown> = {
    status: "active",
    _id: { $nin: appliedJobIds },
  };

  // Prefer jobs in preferred countries if set
  if (seeker.preferredCountries?.length) {
    query["location.country"] = { $in: seeker.preferredCountries };
  }

  // Fetch candidate jobs (more than needed, we'll score and rank)
  const candidateJobs = await Job.find(query)
    .sort({ createdAt: -1 })
    .limit(50)
    .select("title description requirements salary location status employerId tags createdAt")
    .populate("employerId", "companyName logo")
    .lean();

  // Score each job locally
  const seekerSkills = new Set((seeker.skills ?? []).map((s: string) => s.toLowerCase()));
  const seekerCountries = new Set((seeker.preferredCountries ?? []).map((c: string) => c.toLowerCase()));
  const seekerRoles = new Set<string>((seeker.preferredRoles ?? []).map((r: string) => r.toLowerCase()));
  const seekerJobType = seeker.preferredJobType ?? "any";
  const seekerSalaryMin = seeker.preferredSalary?.min ?? 0;
  const seekerSalaryMax = seeker.preferredSalary?.max ?? Infinity;

  const scored = candidateJobs.map((job) => {
    let score = 0;

    // Skills overlap (40%)
    const jobSkills = (job.requirements?.skills ?? []).map((s: string) => s.toLowerCase());
    let skillOverlap = 0;
    if (jobSkills.length > 0 && seekerSkills.size > 0) {
      skillOverlap = jobSkills.filter((s: string) => seekerSkills.has(s)).length;
      score += (skillOverlap / Math.max(jobSkills.length, 1)) * 40;
    }

    // Role title relevance check
    const titleLower = job.title?.toLowerCase() ?? "";
    let roleMatch = false;
    for (const role of seekerRoles) {
      if (titleLower.includes(role) || role.includes(titleLower)) {
        roleMatch = true;
        break;
      }
    }

    // Filter out jobs with zero skill overlap AND no role title relevance
    // (completely unrelated jobs like "HR Manager" for a "Frontend Developer")
    if (seekerRoles.size > 0 && seekerSkills.size > 0 && !roleMatch && skillOverlap === 0) {
      return { ...job, matchScore: 0, _filtered: true };
    }

    // Location match (25%)
    const jobCountry = job.location?.country?.toLowerCase() ?? "";
    if (seekerCountries.size === 0 || seekerCountries.has(jobCountry)) {
      score += 25;
    } else if (job.location?.isRemote) {
      score += 15; // partial credit for remote
    }

    // Salary range overlap (15%)
    const jobSalaryMin = job.salary?.min ?? 0;
    const jobSalaryMax = job.salary?.max ?? Infinity;
    if (
      (jobSalaryMin <= seekerSalaryMax && jobSalaryMax >= seekerSalaryMin) ||
      seekerSalaryMin === 0
    ) {
      score += 15;
    }

    // Job type match (5%)
    if (seekerJobType === "any") {
      score += 5;
    } else if (
      (seekerJobType === "remote" && job.location?.isRemote) ||
      (seekerJobType === "onsite" && !job.location?.isRemote) ||
      seekerJobType === "hybrid"
    ) {
      score += 5;
    }

    // Role title match bonus (15%)
    if (roleMatch) {
      score += 15;
    }

    return { ...job, matchScore: Math.min(100, Math.round(score)) };
  });

  // Remove filtered-out jobs, sort by score descending
  const relevant = scored.filter((j) => !(j as Record<string, unknown>)._filtered);
  relevant.sort((a, b) => b.matchScore - a.matchScore);
  const totalMatches = relevant.length;
  const items = relevant.slice(0, itemLimit);

  return NextResponse.json({ items, totalMatches });
});
