import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import {
  calculateMatchScore,
  seekerProfileFromDoc,
  jobProfileFromDoc,
  getMatchedSkills,
} from "@/lib/matchScore";

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
    .select("skills preferredCountries preferredRoles preferredSalary preferredJobType experience education")
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

  // Score each job using the shared match algorithm (single source of truth)
  const seekerProfile = seekerProfileFromDoc(seeker);
  const seekerSkillSet = new Set(seekerProfile.skills.map((s) => s.toLowerCase()));
  const seekerRoles = new Set<string>(seekerProfile.preferredRoles ?? []);

  const scored = candidateJobs.map((job) => {
    const jobSkills = (job.requirements?.skills ?? []).map((s: string) => s.toLowerCase());
    const skillOverlap = jobSkills.filter((s: string) => seekerSkillSet.has(s)).length;

    // Role title relevance check
    const titleLower = job.title?.toLowerCase() ?? "";
    let roleMatch = false;
    for (const role of seekerRoles) {
      if (titleLower.includes(role) || role.includes(titleLower)) {
        roleMatch = true;
        break;
      }
    }

    // Filter out completely unrelated jobs (no skill overlap AND no role relevance)
    // e.g. "HR Manager" surfaced for a "Frontend Developer".
    if (seekerRoles.size > 0 && seekerSkillSet.size > 0 && !roleMatch && skillOverlap === 0) {
      return { ...job, matchScore: 0, _filtered: true };
    }

    const matchScore = calculateMatchScore(seekerProfile, jobProfileFromDoc(job));
    const matchedSkills = getMatchedSkills(seekerProfile.skills, job.requirements?.skills ?? []);
    return { ...job, matchScore, matchedSkills };
  });

  // Remove filtered-out jobs, sort by score descending
  const relevant = scored.filter((j) => !(j as Record<string, unknown>)._filtered);
  relevant.sort((a, b) => b.matchScore - a.matchScore);
  const totalMatches = relevant.length;
  const items = relevant.slice(0, itemLimit);

  return NextResponse.json({ items, totalMatches });
});
