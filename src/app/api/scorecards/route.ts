import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Scorecard from "@/models/Scorecard";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { scorecardCreateSchema } from "@/lib/validators/scorecards";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyScorecardSubmitted } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const applicationId = searchParams.get("applicationId") ?? "";
  const applicationIds = searchParams.get("applicationIds") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) {
      return NextResponse.json({
        scorecards: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }
    query.employerId = emp._id;
  } else if (ctx.role === "job_seeker") {
    // Job seekers can only see their own scorecards (if needed)
    return NextResponse.json(
      { error: "Only employers can list scorecards" },
      { status: 403 }
    );
  }

  if (applicationId) query.applicationId = applicationId;
  else if (applicationIds) {
    const ids = applicationIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) query.applicationId = { $in: ids };
  }

  const skip = (page - 1) * limit;
  const [scorecards, total] = await Promise.all([
    Scorecard.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("interviewId", "scheduledAt status")
      .populate("applicationId", "status")
      .populate("jobSeekerId", "userId")
      .lean(),
    Scorecard.countDocuments(query),
  ]);

  return NextResponse.json({
    scorecards,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json(
      { error: "Only employers can create scorecards" },
      { status: 403 }
    );
  }

  await connectDB();
  const body = await validateBody(req, scorecardCreateSchema);
  const { interviewId, scores, recommendation, notes, strengths, concerns } =
    body;

  // Get interview and verify ownership
  const interview = await Interview.findById(interviewId).lean();
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp || emp._id.toString() !== interview.employerId.toString()) {
    return NextResponse.json(
      { error: "You do not own this interview" },
      { status: 403 }
    );
  }

  // Check if this evaluator already submitted a scorecard for this interview
  const existing = await Scorecard.findOne({ interviewId, evaluatedBy: ctx.userId }).lean();
  if (existing) {
    return NextResponse.json(
      { error: "You have already submitted a scorecard for this interview" },
      { status: 409 }
    );
  }

  // Compute overall score
  const overallScore =
    (scores.technicalSkills +
      scores.communication +
      scores.cultureFit +
      scores.problemSolving +
      scores.motivation) /
    5;

  // Create scorecard
  const evaluator = await User.findById(ctx.userId).select("name").lean();
  const scorecard = new Scorecard({
    interviewId,
    applicationId: interview.applicationId,
    jobSeekerId: interview.jobSeekerId,
    employerId: emp._id,
    evaluatedBy: ctx.userId,
    evaluatorName: evaluator?.name ?? "Unknown",
    scores,
    overallScore,
    recommendation,
    notes,
    strengths,
    concerns,
  });

  await scorecard.save();

  // Log activity
  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "scorecard.create",
    resource: "scorecards",
    resourceId: scorecard._id.toString(),
    meta: {
      interviewId,
      applicationId: interview.applicationId,
      overallScore,
      recommendation,
    },
    req,
  });

  // Notify the candidate about their interview feedback
  try {
    const application = await Application.findById(interview.applicationId)
      .select("jobId")
      .populate("jobId", "title")
      .lean();
    const jobTitle = (application?.jobId as { title?: string })?.title ?? "a position";
    const companyName = emp ? (await Employer.findById(emp._id).select("companyName").lean())?.companyName ?? "the company" : "the company";

    await notifyScorecardSubmitted(
      interview.jobSeekerId.toString(),
      jobTitle,
      companyName,
      overallScore,
      interview.applicationId.toString(),
    );
  } catch (err) {
    // Non-blocking — scorecard was already saved
    console.error("[scorecard] Failed to notify candidate:", err);
  }

  return NextResponse.json(
    { scorecard: scorecard.toObject() },
    { status: 201 }
  );
}

export const GET = withAuth(getHandler, {
  resource: "applications",
  action: "read",
});
export const POST = withAuth(postHandler, {
  resource: "applications",
  action: "update",
});
