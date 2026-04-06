import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import { Scorecard } from "@/models/Scorecard";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { scorecardCreateSchema } from "@/lib/validators/interviews";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/interviews/[id]/scorecard — fetch scorecard for this interview
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();

  const interview = await Interview.findById(params?.id).select("employerId jobSeekerId applicationId").lean();
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  // Restricit to employer-side roles and the candidate's own interview
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(interview.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "job_seeker") {
    // Candidates can only view their own scorecard after the interview is completed
    const scorecard = await Scorecard.findOne({ interviewId: params?.id }).lean();
    if (!scorecard || String(interview.jobSeekerId) !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!["agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scorecard = await Scorecard.findOne({ interviewId: params?.id })
    .populate("evaluatedBy", "name email")
    .lean();

  return NextResponse.json({ scorecard: scorecard ?? null });
}

// POST /api/interviews/[id]/scorecard — interviewer submits scorecard
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!["employer", "agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const interview = await Interview.findById(params?.id).lean();
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  // Employers can only score their own interviews
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(interview.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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
