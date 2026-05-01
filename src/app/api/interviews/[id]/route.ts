import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { interviewUpdateSchema } from "@/lib/validators/interviews";
import { isValidObjectId } from "@/lib/security/sanitize";
import { notify } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const interview = await Interview.findById(params?.id)
    .populate({ path: "applicationId", populate: { path: "jobId", select: "title employerId" } })
    .lean();
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  return NextResponse.json({ interview });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const interview = await Interview.findById(params?.id);
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  const body = await validateBody(req, interviewUpdateSchema);
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) update[k] = v;

  if (body.status === "rescheduled") {
    update.rescheduleCount = (interview.rescheduleCount ?? 0) + 1;
  }

  // Also increment rescheduleCount when scheduledAt is changed (in-place reschedule)
  if (body.scheduledAt && !body.status) {
    update.rescheduleCount = (interview.rescheduleCount ?? 0) + 1;
    // Reset candidate response since time changed — they need to re-confirm
    update.candidateResponse = "pending";
    update.candidateResponseAt = undefined;
    // Keep status as "scheduled" even if it was previously "confirmed"
    if (interview.status === "confirmed") {
      update.status = "scheduled";
    }
  }

  Object.assign(interview, update);
  await interview.save();

  // Notify candidate when interview is rescheduled (in-place)
  if (body.scheduledAt && !body.status) {
    const jobSeeker = await JobSeeker.findById(interview.jobSeekerId).select("userId").lean();
    const job = await Job.findById(interview.jobId).select("title").lean();
    const jobTitle = (job as { title?: string } | null)?.title ?? "a position";
    if (jobSeeker) {
      await notify({
        userId: String((jobSeeker as { userId: unknown }).userId),
        type: "interview_scheduled",
        title: "Interview Rescheduled",
        message: `Your interview for "${jobTitle}" has been rescheduled to ${new Date(body.scheduledAt).toLocaleString()}. Please confirm your availability.`,
        link: `/en/job-seeker/interviews`,
        sendEmail: true,
        metadata: { jobTitle, interviewId: params?.id, scheduledAt: body.scheduledAt },
      }).catch(() => { /* non-blocking */ });
    }
  }

  // Notify candidate when interview is cancelled via PATCH
  if (body.status === "cancelled") {
    const jobSeeker = await JobSeeker.findById(interview.jobSeekerId).select("userId").lean();
    const job = await Job.findById(interview.jobId).select("title").lean();
    const jobTitle = (job as { title?: string } | null)?.title ?? "a position";
    if (jobSeeker) {
      await notify({
        userId: String((jobSeeker as { userId: unknown }).userId),
        type: "interview_update",
        title: "Interview Cancelled",
        message: `Your interview for "${jobTitle}" has been cancelled by the employer.`,
        link: `/en/job-seeker/interviews`,
        sendEmail: true,
        metadata: { jobTitle, interviewId: params?.id },
      }).catch(() => { /* non-blocking */ });
    }
  }

  // Handle outcome-based workflow transitions
  if (body.status === "completed" && body.outcome) {
    const application = await Application.findById(interview.applicationId);
    const jobSeeker = application
      ? await JobSeeker.findById(interview.jobSeekerId).select("userId fullName").lean()
      : null;
    const job = application
      ? await Job.findById(interview.jobId).select("title").lean()
      : null;
    const jobTitle = (job as { title?: string } | null)?.title ?? "a position";

    if (body.outcome === "failed" && application) {
      // Rejection: update application status and notify
      application.status = "rejected";
      application.statusHistory = application.statusHistory || [];
      application.statusHistory.push({
        status: "rejected",
        changedAt: new Date(),
        changedBy: ctx.userId,
      });
      await application.save();

      if (jobSeeker) {
        await notify({
          userId: String((jobSeeker as { userId: unknown }).userId),
          type: "application_status_update",
          title: "Interview Result",
          message: `Thank you for interviewing for "${jobTitle}". Unfortunately, we have decided to move forward with other candidates at this time.`,
          link: `/en/job-seeker/applications`,
          sendEmail: true,
          metadata: { jobTitle, applicationId: String(application._id), outcome: "failed" },
        }).catch(() => { /* non-blocking */ });
      }
    } else if (body.outcome === "passed" && application) {
      // Passed: move application to selected stage
      application.status = "selected";
      application.statusHistory = application.statusHistory || [];
      application.statusHistory.push({
        status: "selected",
        changedAt: new Date(),
        changedBy: ctx.userId,
      });
      await application.save();

      if (jobSeeker) {
        await notify({
          userId: String((jobSeeker as { userId: unknown }).userId),
          type: "application_status_update",
          title: "Interview Cleared!",
          message: `Congratulations! You have cleared the round ${interview.interviewRound ?? 1} interview for "${jobTitle}". The employer will reach out with next steps soon.`,
          link: `/en/job-seeker/applications`,
          sendEmail: true,
          metadata: { jobTitle, applicationId: String(application._id), outcome: "passed" },
        }).catch(() => { /* non-blocking */ });
      }
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.update",
    resource: "interviews",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ interview });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const interview = await Interview.findById(params?.id);
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  interview.status = "cancelled";
  await interview.save();

  // Notify candidate about cancellation
  const cancelledJobSeeker = await JobSeeker.findById(interview.jobSeekerId).select("userId").lean();
  const cancelledJob = await Job.findById(interview.jobId).select("title").lean();
  const cancelledJobTitle = (cancelledJob as { title?: string } | null)?.title ?? "a position";
  if (cancelledJobSeeker) {
    await notify({
      userId: String((cancelledJobSeeker as { userId: unknown }).userId),
      type: "interview_update",
      title: "Interview Cancelled",
      message: `Your interview for "${cancelledJobTitle}" has been cancelled by the employer.`,
      link: `/en/job-seeker/interviews`,
      sendEmail: true,
      metadata: { jobTitle: cancelledJobTitle, interviewId: params?.id },
    }).catch(() => { /* non-blocking */ });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.cancel",
    resource: "interviews",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Interview cancelled" });
}

export const GET = withAuth(getHandler, { resource: "interviews", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "interviews", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "interviews", action: "delete" });
