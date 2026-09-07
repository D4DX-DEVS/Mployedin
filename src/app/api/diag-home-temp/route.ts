import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import Job from "@/models/Job";
import { calculateMatchScore, jobProfileFromDoc } from "@/lib/matchScore";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";

async function getHandler(_req: unknown, ctx: { userId: string }) {
  const userId = ctx.userId;
  await connectDB();
  const seeker = await JobSeeker.findOne({ userId })
    .select(
      "_id userId skills preferredCountries preferredRoles preferredSalary preferredJobType " +
        "experience education languages summary profileCompleteness cvFileUrl cv " +
        "nationality currentLocation preferredLocations linkedin socialLinks"
    )
    .lean();
  if (!seeker) return NextResponse.json({ err: "no seeker" });
  const now = new Date();
  const recentJobs = await Job.find({
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("title salary location employerId tags createdAt requirements employmentType")
    .populate("employerId", "companyName logo")
    .lean();
  const allActiveApps = await Application.find({ jobSeekerId: seeker._id, status: { $ne: "withdrawn" } })
    .select("jobId").lean();
  const appliedJobIdSet = new Set(allActiveApps.map((a) => String(a.jobId)));
  const seekerProfile = await effectiveSeekerProfile(userId, seeker);
  const seekerSkillSet = new Set(seekerProfile.skills.map((s) => s.toLowerCase()));
  const seekerRoleList = (seekerProfile.preferredRoles ?? []).map((r) => r.toLowerCase());
  const hasRelevanceSignal = seekerSkillSet.size > 0 && seekerRoleList.length > 0;
  const isRelevantJob = (job: Record<string, unknown>): boolean => {
    if (!hasRelevanceSignal) return true;
    const reqs = job.requirements as { skills?: string[] } | null;
    const jobSkills = (reqs?.skills ?? []).map((s) => s.toLowerCase());
    const skillOverlap = jobSkills.some((s) => seekerSkillSet.has(s));
    const titleLower = String(job.title ?? "").toLowerCase();
    const roleMatch = seekerRoleList.some((role) => titleLower.includes(role) || role.includes(titleLower));
    return skillOverlap || roleMatch;
  };
  const pool = recentJobs as Array<Record<string, unknown>>;
  const afterApplied = pool.filter((j) => !appliedJobIdSet.has(String(j._id)));
  const afterRelevant = afterApplied.filter(isRelevantJob);
  const scored = afterRelevant.map((job) => ({
    title: String(job.title ?? ""),
    matchScore: calculateMatchScore(seekerProfile, jobProfileFromDoc(job as Parameters<typeof jobProfileFromDoc>[0])),
  })).sort((a, b) => b.matchScore - a.matchScore);
  return NextResponse.json({
    seekerProfileSkills: seekerProfile.skills,
    seekerProfileRoles: seekerProfile.preferredRoles,
    hasRelevanceSignal,
    poolSize: pool.length,
    afterApplied: afterApplied.length,
    afterRelevant: afterRelevant.length,
    aboveThreshold: scored.filter((s) => s.matchScore >= 30).length,
    top10: scored.slice(0, 10),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = withAuth(getHandler as any);
