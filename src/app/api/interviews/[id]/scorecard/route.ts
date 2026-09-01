import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import { Scorecard } from "@/models/Scorecard";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { scorecardCreateSchema } from "@/lib/validators/interviews";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** True when the caller's employer scope covers this interview. Admin passes. */
async function callerOwnsInterview(employerId: unknown, ctx: AuthCtx): Promise<boolean> {
  const employerIds = await getScopedEmployerIds(ctx);
  if (employerIds === null) return true;
  return employerIds.map(String).includes(String(employerId));
}

// GET /api/interviews/[id]/scorecard — fetch scorecard for this interview
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const interview = await Interview.findById(params?.id).select("employerId jobSeekerId applicationId status").lean();
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  // Restrict to employer-side roles and the candidate's own interview
  let isCandidate = false;
  if (ctx.role === "job_seeker") {
    // Candidates can only view their own scorecard, and only once the interview
    // is completed. interview.jobSeekerId is a JobSeeker._id, not a User._id —
    // comparing it to ctx.userId directly 403'd the rightful candidate.
    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker || String(interview.jobSeekerId) !== String(seeker._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (interview.status !== "completed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    isCandidate = true;
  } else if (!(await callerOwnsInterview(interview.employerId, ctx))) {
    // employer/agent/super_agent must own the interview's employer; any other
    // role resolves to an empty scope and is denied.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scorecard = await Scorecard.findOne({ interviewId: params?.id })
    .populate("evaluatedBy", "name email")
    .lean();

  // Candidate-facing view: an explicit allow-list, not a strip-list, so any
  // employer-private field added to the Scorecard model later is withheld by
  // default rather than leaking until someone remembers to exclude it.
  // Withheld on purpose: notes, concerns, recommendation, evaluatedBy — the
  // panel's internal deliberation and hiring verdict.
  if (isCandidate && scorecard) {
    const sc = scorecard as Record<string, unknown>;
    return NextResponse.json({
      scorecard: {
        _id: sc._id,
        interviewId: sc.interviewId,
        applicationId: sc.applicationId,
        scores: sc.scores,
        overallScore: sc.overallScore,
        strengths: sc.strengths,
        createdAt: sc.createdAt,
      },
    });
  }

  return NextResponse.json({ scorecard: scorecard ?? null });
}

// POST /api/interviews/[id]/scorecard — interviewer submits scorecard
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (!["employer", "agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const interview = await Interview.findById(params?.id).lean();
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  // Scorers can only score interviews at their own employers — the role check
  // above only proves the caller is *an* employer/agent.
  if (!(await callerOwnsInterview(interview.employerId, ctx))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Scorecard is unique per interview (upsert)
  const existing = await Scorecard.findOne({ interviewId: params?.id });
  if (existing) {
    return NextResponse.json(
      { error: "Scorecard already submitted for this interview" },
      { status: 409 }
    );
  }

  const body = await validateBody(req, scorecardCreateSchema);

  const { scores } = body;
  const overallScore =
    (scores.technicalSkills + scores.communication + scores.cultureFit + scores.problemSolving + scores.motivation) / 5;

  const scorecard = await Scorecard.create({
    interviewId: params?.id,
    applicationId: interview.applicationId,
    jobSeekerId: interview.jobSeekerId,
    employerId: interview.employerId,
    evaluatedBy: ctx.userId,
    scores,
    overallScore: Math.round(overallScore * 100) / 100,
    recommendation: body.recommendation,
    notes: body.notes,
    strengths: body.strengths,
    concerns: body.concerns,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.scorecard_submitted",
    resource: "interviews",
    resourceId: params?.id,
    changes: { after: { overallScore, recommendation: body.recommendation } },
    req,
  });

  return NextResponse.json({ scorecard }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler, { resource: "interviews", action: "create" });
