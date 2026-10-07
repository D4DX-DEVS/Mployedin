import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import SkillConfirmation from "@/models/SkillConfirmation";
import type { UserRole } from "@/models/User";
import { normalizeSkill, tokenizeSkill } from "@/lib/matchScore";

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

  // One entry per skill: a job listing "React" as required and "React.js" as
  // preferred is still one question.
  const jobSkills: string[] = [];
  const seenJobSkills = new Set<string>();
  for (const skill of [
    ...(job.requirements?.skills ?? []),
    ...(job.requirements?.preferredSkills ?? []),
  ] as string[]) {
    const key = normalizeSkill(skill);
    if (!key || seenJobSkills.has(key)) continue;
    seenJobSkills.add(key);
    jobSkills.push(skill);
  }

  if (jobSkills.length === 0) {
    return NextResponse.json({
      matchedSkills: [],
      confirmedSkills: [],
      deniedSkills: [],
      unansweredSkills: [],
      totalJobSkills: 0,
    });
  }

  // Compared the way the match score compares them (lib/matchScore.ts), so
  // "React.js" on the profile covers "React" on the job — before, the card
  // said 93% with React matched while this route asked "Do you have React?".
  const seekerTokens = new Set(((seeker?.skills ?? []) as string[]).flatMap(tokenizeSkill));
  const inProfile = (skill: string) => tokenizeSkill(skill).some((t) => seekerTokens.has(t));

  // Confirmation lookup, keyed the same way: an answer about "React" applies to "ReactJS".
  const confirmationMap = new Map<string, (typeof confirmations)[number]>();
  for (const c of confirmations) {
    confirmationMap.set(normalizeSkill(c.skill), c);
  }

  const matchedSkills: string[] = [];
  const confirmedSkills: string[] = [];
  const deniedSkills: string[] = [];
  const unansweredSkills: string[] = [];

  for (const skill of jobSkills) {
    const conf = confirmationMap.get(normalizeSkill(skill));
    const confirmStatus = conf?.status;

    if (inProfile(skill) && confirmStatus !== "denied") {
      // In profile and not denied
      matchedSkills.push(skill);
    } else if (confirmStatus === "confirmed") {
      // Confirmed via micro-question but not yet in profile (edge case)
      confirmedSkills.push(skill);
    } else if (confirmStatus === "denied") {
      deniedSkills.push(skill);
    } else if (confirmStatus === "skipped") {
      // Skipped — check 30-day cooldown
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
