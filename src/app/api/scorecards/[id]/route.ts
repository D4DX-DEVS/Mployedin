import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Scorecard from "@/models/Scorecard";
import { Employer } from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { scorecardUpdateSchema } from "@/lib/validators/scorecards";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const id = params?.id;

  const scorecard = await Scorecard.findById(id).lean();
  if (!scorecard) {
    return NextResponse.json({ error: "Scorecard not found" }, { status: 404 });
  }

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || emp._id.toString() !== scorecard.employerId.toString()) {
      return NextResponse.json(
        { error: "You do not own this scorecard" },
        { status: 403 }
      );
    }
  }

  return NextResponse.json({ scorecard });
}

async function patchHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>
) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (ctx.role !== "employer") {
    return NextResponse.json(
      { error: "Only employers can update scorecards" },
      { status: 403 }
    );
  }

  await connectDB();
  const id = params?.id;

  const scorecard = await Scorecard.findById(id);
  if (!scorecard) {
    return NextResponse.json({ error: "Scorecard not found" }, { status: 404 });
  }

  // Verify ownership
  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp || emp._id.toString() !== scorecard.employerId.toString()) {
    return NextResponse.json(
      { error: "You do not own this scorecard" },
      { status: 403 }
    );
  }

  const body = await validateBody(req, scorecardUpdateSchema);

  // Update fields
  if (body.scores) {
    scorecard.scores = body.scores;
    scorecard.overallScore =
      (body.scores.technicalSkills +
        body.scores.communication +
        body.scores.cultureFit +
        body.scores.problemSolving +
        body.scores.motivation) /
      5;
  }
  if (body.recommendation !== undefined) {
    scorecard.recommendation = body.recommendation;
  }
  if (body.notes !== undefined) {
    scorecard.notes = body.notes || undefined;
  }
  if (body.strengths !== undefined) {
    scorecard.strengths = body.strengths || undefined;
  }
  if (body.concerns !== undefined) {
    scorecard.concerns = body.concerns || undefined;
  }

  await scorecard.save();

  // Log activity
  await logActivity({
    ...actorFromCtx(ctx),
    action: "scorecard.update",
    resource: "scorecards",
    resourceId: scorecard._id.toString(),
    changes: {
      before: {},
      after: body,
    },
    meta: {
      scorecardId: scorecard._id.toString(),
    },
    req,
  });

  return NextResponse.json({ scorecard });
}

export const GET = withAuth(getHandler, {
  resource: "applications",
  action: "read",
});
export const PATCH = withAuth(patchHandler, {
  resource: "applications",
  action: "update",
});
