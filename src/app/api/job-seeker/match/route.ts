import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { SEEKER_MATCH_FIELDS, hasScoringEvidence } from "@/lib/matchScore";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import { RECOMMENDED_JOB_SELECT } from "@/lib/jobRecommendations";
import { scoreOnePair } from "@/lib/matching/seekerMatches";
import { toCandidateJob } from "@/lib/matching/recommend";
import { reportFromBreakdown } from "@/lib/matching/requirementReport";
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
 * `parts` are the scored components in play for this job (0–100 each) and
 * `shares` what each counts for (RELEVANCE_POINTS in lib/matching/constants.ts:
 * role and experience always; skills, education, licences and languages only
 * when the job asks for them). `report` is every requirement against the profile — has /
 * partly / missing / not on the profile. Location, pay and work mode are not
 * parts: they are pass/fail gates, reported through `eligible` / `reason`.
 *
 * A profile that states nothing the score reads gets `score: null`: the engine
 * would answer with its neutral defaults, the same figure for every job.
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
  if (!hasScoringEvidence(profile)) {
    return NextResponse.json({ score: null, reason: "profile_empty" });
  }
  const pair = await scoreOnePair(profile, job as unknown as Record<string, unknown>);
  // The parts in play for this job and each one's share of the score.
  const shares = pair.breakdown.shares ?? { skills: 40, role: 25, experience: 15 };

  return NextResponse.json({
    score: pair.score,
    eligible: pair.eligible,
    ...(pair.reason ? { reason: pair.reason } : {}),
    // Parts in play for this job with each one's share of the score (skills
    // drop out when the job lists none; licences / languages join when asked).
    parts: Object.fromEntries(
      Object.keys(shares).map((part) => [part, pair.breakdown[part as keyof typeof pair.breakdown]]),
    ),
    shares,
    mustHaveStatus: pair.breakdown.mustHaveStatus,
    report: reportFromBreakdown(pair.breakdown, toCandidateJob(job as unknown as Record<string, unknown>).profile.requirements),
    // The AI review moves the deterministic score by at most ±10 points.
    aiAdjustment: pair.score - pair.breakdown.overall,
    matchedSkills: pair.breakdown.matchedSkills,
    missingSkills: pair.breakdown.missingSkills,
    skillsUnknown: pair.breakdown.skillsUnknown,
  });
}

export const GET = withAuth(getHandler);
