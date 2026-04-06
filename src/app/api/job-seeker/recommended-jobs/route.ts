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
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("skills preferredCountries preferredRoles preferredSalary preferredJobType")
    .lean();

  if (!seeker) {
    return NextResponse.json({ items: [] });
  }

  // Get IDs of jobs already applied to
  const appliedJobIds = await Application.find({ jobSeekerId: ctx.userId })
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
  const seekerRoles = new Set((seeker.preferredRoles ?? []).map((r: string) => r.toLowerCase()));
  const seekerJobType = seeker.preferredJobType ?? "any";
  const seekerSalaryMin = seeker.preferredSalary?.min ?? 0;
  const seekerSalaryMax = seeker.preferredSalary?.max ?? Infinity;

  const scored = candidateJobs.map((job) => {
    let score = 0;

    // Skills overlap (40%)
    const jobSkills = (job.requirements?.skills ?? []).map((s: string) => s.toLowerCase());
    if (jobSkills.length > 0 && seekerSkills.size > 0) {
      const overlap = jobSkills.filter((s: string) => seekerSkills.has(s)).length;
      score += (overlap / Math.max(jobSkills.length, 1)) * 40;
    }

    // Location match (30%)
    const jobCountry = job.location?.country?.toLowerCase() ?? "";
    if (seekerCountries.size === 0 || seekerCountries.has(jobCountry)) {
      score += 30;
    } else if (job.location?.isRemote) {
      score += 20; // partial credit for remote
    }

    // Salary range overlap (20%)
    const jobSalaryMin = job.salary?.min ?? 0;
    const jobSalaryMax = job.salary?.max ?? Infinity;
    if (
      (jobSalaryMin <= seekerSalaryMax && jobSalaryMax >= seekerSalaryMin) ||
      seekerSalaryMin === 0
    ) {
      score += 20;
    }

    // Job type match (10%)
    if (seekerJobType === "any") {
      score += 10;
    } else if (
      (seekerJobType === "remote" && job.location?.isRemote) ||
      (seekerJobType === "onsite" && !job.location?.isRemote) ||
      seekerJobType === "hybrid"
    ) {
      score += 10;
    }

    // Bonus: role title match
    const titleLower = job.title?.toLowerCase() ?? "";
    for (const role of seekerRoles) {
      if (titleLower.includes(role)) {
        score += 5;
        break;
      }
    }

    return { ...job, matchScore: Math.min(100, Math.round(score)) };
  });

  // Sort by score descending, take top 5
  scored.sort((a, b) => b.matchScore - a.matchScore);
  const items = scored.slice(0, 5);

  return NextResponse.json({ items });
});
