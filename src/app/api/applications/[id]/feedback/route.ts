import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { CandidateNPS } from "@/models/CandidateNPS";
import { validateBody } from "@/lib/validators";
import { npsCreateSchema } from "@/lib/validators/applications";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// POST /api/applications/[id]/feedback — job seeker submits NPS rating
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only candidates can submit feedback" }, { status: 403 });
  }

  await connectDB();

  const application = await Application.findById(params?.id)
    .select("jobSeekerId employerId status")
    .lean();

  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Ownership check — only the applicant can rate
  const JobSeeker = (await import("@/models/JobSeeker")).default;
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker || String(application.jobSeekerId) !== String(seeker._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Must be in a terminal state
  const terminalStatuses = ["hired", "rejected", "withdrawn"];
  if (!terminalStatuses.includes(application.status)) {
    return NextResponse.json(
      { error: "Feedback can only be submitted after a final decision (hired/rejected/withdrawn)" },
      { status: 400 }
    );
  }

  // One feedback per application
  const existing = await CandidateNPS.findOne({ applicationId: params?.id });
  if (existing) {
    return NextResponse.json({ error: "Feedback already submitted for this application" }, { status: 409 });
  }

  const body = await validateBody(req, npsCreateSchema);

  const nps = await CandidateNPS.create({
    applicationId: params?.id,
    companyId: application.employerId,
    candidateId: seeker._id,
    rating: body.rating,
    comment: body.comment,
    processStage: application.status,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "application.feedback",
    resource: "applications",
    resourceId: params?.id,
    meta: { rating: body.rating },
    req,
  });

  return NextResponse.json({ feedback: nps }, { status: 201 });
}

export const POST = withAuth(postHandler);
