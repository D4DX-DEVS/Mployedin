import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { humanReviewRequestSchema } from "@/lib/validators/applications";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { canRequestHumanReview } from "@/lib/hiring/automatedDecision";
import { effectiveJobStages, type JobWorkflowCarrier } from "@/lib/hiring/jobWorkflow";
import { stageForApplication } from "@/lib/hiring/workflowStages";
import { notifyHumanReviewRequested } from "@/lib/notifications/trigger";
import logger from "@/lib/logger";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * POST /api/applications/[id]/human-review — the candidate asks for a person to
 * review an automatic rejection (lib/hiring/automatedDecision.ts). The
 * application goes back to "applied" so it sits in the employer's queue again,
 * and the employer is told. Allowed once per application.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only the candidate can ask for a review" }, { status: 403 });
  }

  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.applications);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  await connectDB();

  const application = await Application.findById(params?.id);
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const JobSeeker = (await import("@/models/JobSeeker")).default;
  const seeker = (await JobSeeker.findOne({ userId: ctx.userId }).select("_id fullName").lean()) as
    { _id: unknown; fullName?: string } | null;
  if (!seeker || String(application.jobSeekerId) !== String(seeker._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!canRequestHumanReview(application)) {
    return NextResponse.json(
      { error: "A review can only be asked for once, on an application the automatic screening rejected.", code: "REVIEW_NOT_AVAILABLE" },
      { status: 409 },
    );
  }

  const body = await validateBody(req, humanReviewRequestSchema);
  const now = new Date();

  const job = (await Job.findById(application.jobId).select("title employerId workflow").lean()) as
    (JobWorkflowCarrier & { title?: string; employerId?: unknown }) | null;
  const entered = job ? stageForApplication(effectiveJobStages(job), "applied", null) : null;

  // One conditional write: two clicks (or a staff move in between) can't both pass the check above.
  const updated = await Application.findOneAndUpdate(
    {
      _id: application._id,
      status: "rejected",
      "automatedDecision.kind": "auto_reject",
      "automatedDecision.reviewRequestedAt": { $exists: false },
    },
    {
      $set: {
        status: "applied",
        stageId: entered?.id,
        "automatedDecision.reviewRequestedAt": now,
        ...(body.note ? { "automatedDecision.reviewNote": body.note } : {}),
      },
      $unset: { rejectionReason: 1 },
      $push: {
        statusHistory: {
          status: "applied",
          ...(entered ? { stageId: entered.id, stageLabel: entered.label } : {}),
          changedAt: now,
          changedBy: ctx.userId,
          note: "Candidate asked for a human review of the automatic rejection",
        },
      },
    },
    { returnDocument: "after" },
  ).select("_id status automatedDecision").lean<{ _id: unknown; status: string; automatedDecision?: Record<string, unknown> } | null>();
  if (!updated) {
    return NextResponse.json(
      { error: "A review can only be asked for once, on an application the automatic screening rejected.", code: "REVIEW_NOT_AVAILABLE" },
      { status: 409 },
    );
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "application.human_review_requested",
    resource: "applications",
    resourceId: params?.id,
    changes: { before: { status: "rejected" }, after: { status: "applied" } },
    req,
  });

  const employer = job?.employerId
    ? ((await Employer.findById(job.employerId).select("userId").lean()) as { userId?: unknown } | null)
    : null;
  if (employer?.userId) {
    const User = (await import("@/models/User")).default;
    const user = (await User.findById(ctx.userId).select("name").lean()) as { name?: string } | null;
    notifyHumanReviewRequested(
      String(employer.userId),
      user?.name || seeker.fullName || "A candidate",
      job?.title ?? "a job",
      String(application._id),
    ).catch((err) => { logger.error({ err, applicationId: params?.id }, "failed to notify employer of human review request"); });
  }

  return NextResponse.json({
    application: { _id: String(updated._id), status: updated.status, automatedDecision: updated.automatedDecision },
  });
}

export const POST = withAuth(postHandler);
