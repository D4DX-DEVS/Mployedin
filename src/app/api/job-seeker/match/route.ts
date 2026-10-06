import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import { RECOMMENDED_JOB_SELECT } from "@/lib/jobRecommendations";
import { scoreOnePair } from "@/lib/matching/seekerMatches";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/job-seeker/match?jobId=xxx
 *
 * The seeker's match for one job, with what it is made of. The job list shows
 * a percentage per card; the job page showed none and nothing explained the
 * number (QA 2026-10-06). Scored by the same engine call as the list
 * (`scorePair` via `scoreOnePair`, same AI verdict store), so the two agree.
 *
 * `parts` are the three scored components (0–100 each; weights in
 * lib/matching/constants.ts). Location, pay and work mode are not parts: they
 * are pass/fail gates, reported through `eligible` / `reason`.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId || !mongoose.isValidObjectId(jobId)) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  await connectDB();

  const [job, seeker] = await Promise.all([
    Job.findOne({ _id: jobId, status: "active" }).select(RECOMMENDED_JOB_SELECT).lean(),
    JobSeeker.findOne({ userId: ctx.userId }).select(SEEKER_MATCH_FIELDS).lean(),
  ]);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!seeker) {
    return NextResponse.json({ score: null });
  }

  const profile = await effectiveSeekerProfile(ctx.userId, seeker);
  const pair = await scoreOnePair(profile, job as unknown as Record<string, unknown>);

  return NextResponse.json({
    score: pair.score,
    eligible: pair.eligible,
    ...(pair.reason ? { reason: pair.reason } : {}),
    parts: {
      skills: pair.breakdown.skills,
      role: pair.breakdown.role,
      experience: pair.breakdown.experience,
    },
    // The AI review moves the deterministic score by at most ±10 points.
    aiAdjustment: pair.score - pair.breakdown.overall,
    matchedSkills: pair.breakdown.matchedSkills,
    missingSkills: pair.breakdown.missingSkills,
    skillsUnknown: pair.breakdown.skillsUnknown,
  });
}

export const GET = withAuth(getHandler);
