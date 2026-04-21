import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import SkillConfirmation from "@/models/SkillConfirmation";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/job-seeker/skill-gaps?jobId=xxx
 *
 * Returns skill gap analysis between a job's requirements and the current user's profile,
 * factoring in previous skill confirmations.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  await connectDB();

  const [job, seeker, confirmations] = await Promise.all([
    Job.findById(jobId).select("requirements").lean(),
    JobSeeker.findOne({ userId: ctx.userId }).select("skills").lean(),
    SkillConfirmation.find({ userId: ctx.userId }).lean(),
  ]);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const jobSkills = [
    ...(job.requirements?.skills ?? []),
    ...(job.requirements?.preferredSkills ?? []),
  ];

  if (jobSkills.length === 0) {
    return NextResponse.json({
      matchedSkills: [],
      confirmedSkills: [],
      deniedSkills: [],
      unansweredSkills: [],
      totalJobSkills: 0,
    });
  }

  const seekerSkillsLower = new Set(
    (seeker?.skills ?? []).map((s: string) => s.toLowerCase()),
  );

  // Build confirmation lookup: skill (lowercase) -> status
  const confirmationMap = new Map<string, string>();
  for (const c of confirmations) {
    confirmationMap.set(c.skill.toLowerCase(), c.status);
  }

  const matchedSkills: string[] = [];
  const confirmedSkills: string[] = [];
  const deniedSkills: string[] = [];
  const unansweredSkills: string[] = [];

  for (const skill of jobSkills) {
    const lower = skill.toLowerCase();
    const confirmStatus = confirmationMap.get(lower);

    if (seekerSkillsLower.has(lower) && confirmStatus !== "denied") {
      // In profile and not denied
      matchedSkills.push(skill);
    } else if (confirmStatus === "confirmed") {
      // Confirmed via micro-question but not yet in profile (edge case)
      confirmedSkills.push(skill);
    } else if (confirmStatus === "denied") {
      deniedSkills.push(skill);
    } else if (confirmStatus === "skipped") {
      // Skipped — check 30-day cooldown
      const conf = confirmations.find((c) => c.skill.toLowerCase() === lower);
      const daysSince = conf
        ? (Date.now() - new Date(conf.updatedAt).getTime()) / 86_400_000
        : Infinity;
      if (daysSince >= 30) {
        unansweredSkills.push(skill);
      }
      // else: still in cooldown, don't re-ask
    } else {
      // Never asked
      unansweredSkills.push(skill);
    }
  }

  return NextResponse.json({
    matchedSkills,
    confirmedSkills,
    deniedSkills,
    unansweredSkills,
    totalJobSkills: jobSkills.length,
  });
}

export const GET = withAuth(getHandler);
