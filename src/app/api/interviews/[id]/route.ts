import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { interviewUpdateSchema } from "@/lib/validators/interviews";
import { isValidObjectId } from "@/lib/security/sanitize";
import { verifyInterviewAccess } from "@/lib/interviews/access";
import { generateMeetingLink } from "@/lib/interviews/meetingLink";
import { isMaterialChange } from "@/lib/interviews/materialChange";
import { sendInterviewInvite } from "@/lib/interviews/sendInvite";
import { cancelInterview } from "@/lib/interviews/cancelInterview";
import { notify } from "@/lib/notifications/trigger";
import { resolveRecipientTimeZone } from "@/lib/notifications/recipientZone";
import { formatZonedDateTime } from "@/lib/datetime/zone";
import { getUserLocale, localePath } from "@/lib/i18n/localePath";
import { Employer } from "@/models/Employer";
import { resolveHiringRulesForJob, type WorkflowSettingsCarrier } from "@/lib/hiring/workflowSettings";
import { closeOpenItemsForExit } from "@/lib/hiring/closeOpenInterviews";
import { z } from "zod";
import type { UserRole } from "@/models/User";

/** An interview outcome only moves an application that is still at or before interviewing. */
const OUTCOME_SOURCE_STATUSES = ["shortlisted", "interview_scheduled"];

// A failed outcome rejects the application, and a rejection needs a reason —
// the same rule applicationUpdateSchema enforces on a direct reject.
const interviewPatchSchema = interviewUpdateSchema.extend({
  rejectionReason: z.string().max(500).trim().optional(),
});

/** Application fields the interview detail may carry — never recruiter notes or match internals. */
const APPLICATION_PUBLIC_FIELDS = "jobId jobSeekerId employerId status appliedAt createdAt updatedAt";

interface AuthCtx { userId: string; role: UserRole; locale: string; member?: AuthContext["member"] }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const interview = await Interview.findById(params?.id)
    .populate({
      path: "applicationId",
      select: APPLICATION_PUBLIC_FIELDS,
      populate: { path: "jobId", select: "title employerId" },
    })
    .lean();
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  const accessError = await verifyInterviewAccess(interview, _ctx);
  if (accessError) return accessError;

  return NextResponse.json({ interview });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const interview = await Interview.findById(params?.id);
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  const accessError = await verifyInterviewAccess(interview, ctx);
  if (accessError) return accessError;

  const { rejectionReason, ...body } = await validateBody(req, interviewPatchSchema);

  // Resolve the outcome's effect on the application before anything is saved,
  // so a missing rejection reason fails the request instead of half-applying.
  const outcomeApplication =
    body.status === "completed" && (body.outcome === "passed" || body.outcome === "failed")
      ? await Application.findById(interview.applicationId)
      : null;
  const outcomeMovesApplication = Boolean(
    outcomeApplication && OUTCOME_SOURCE_STATUSES.includes(outcomeApplication.status),
  );
  if (outcomeMovesApplication && body.outcome === "failed" && !rejectionReason) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: [{ path: "rejectionReason", message: "Rejection reason is required when rejecting an application" }],
      },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) update[k] = v;

  // Cancelling goes through cancelInterview (SEQUENCE bump + ICS CANCEL), the
  // same path DELETE takes; every other field in the request still applies.
  const cancelling = body.status === "cancelled";
  if (cancelling) delete update.status;

  // The time moved — whatever else the request says. Keying this on
  // `!body.status` let a reschedule sent with a status keep the candidate
  // "confirmed" for a slot they never saw.
  const timeChanged =
    Boolean(body.scheduledAt) &&
    new Date(body.scheduledAt as string).getTime() !== new Date(interview.scheduledAt).getTime();
  // An editor resending the same time is not a change (and must not reissue the invite).
  if (body.scheduledAt && !timeChanged) delete update.scheduledAt;

  if (body.status === "rescheduled" || timeChanged) {
    update.rescheduleCount = (interview.rescheduleCount ?? 0) + 1;
  }

  if (timeChanged) {
    // Reset candidate response since time changed — they need to re-confirm
    update.candidateResponse = "pending";
    update.candidateResponseAt = undefined;
    // A confirmation was for the old time.
    if (!body.status && interview.status === "confirmed") update.status = "scheduled";
    if (body.status === "confirmed") update.status = "scheduled";
  }

  // Auto-provision a video room for video/hybrid interviews that have none
  // (e.g. when the type is switched to video or a reschedule drops the link).
  const effectiveType = (body.type ?? interview.type) as string;
  const effectiveLink = (body.meetLink ?? interview.meetLink) as string | undefined;
  if ((effectiveType === "video" || effectiveType === "hybrid") && !effectiveLink?.trim()) {
    update.meetLink = generateMeetingLink();
  }

  // A calendar client ignores an update whose SEQUENCE has not moved, so any
  // change the reader can see has to raise it — and then the invitation is
  // reissued so their calendar actually follows. A cancellation bumps it in
  // cancelInterview instead.
  const material = !cancelling && isMaterialChange(update);
  if (material) update.icsSequence = (interview.icsSequence ?? 0) + 1;

  // Validate before mutating the document. Previously a future interview was
  // saved as completed, then returned 409, leaving the UI and database out of
  // sync after an invalid transition attempt.
  if (body.status === "completed") {
    const scheduledTime = new Date(interview.scheduledAt);
    if (scheduledTime > new Date()) {
      return NextResponse.json(
        { error: "Cannot complete interview before its scheduled start time" },
        { status: 409 }
      );
    }
  }

  Object.assign(interview, update);
  await interview.save();

  const seekerDoc = (await JobSeeker.findById(interview.jobSeekerId).select("userId").lean()) as { userId?: unknown } | null;
  const seekerUserId = seekerDoc?.userId ? String(seekerDoc.userId) : null;
  const seekerLocale = await getUserLocale(seekerUserId);

  if (material) {
    // Fire and forget: the interview is already saved, and a mail failure
    // must not turn a successful edit into an error for the employer. This
    // invitation is the email for the change — the notices below are in-app.
    void sendInterviewInvite(String(interview._id), seekerLocale).catch(() => {});
  }

  if (cancelling && (await cancelInterview(interview._id))) {
    interview.status = "cancelled";
  }

  // Tell the candidate the time moved, in their own zone and language.
  if (timeChanged && !cancelling && seekerUserId) {
    const job = await Job.findById(interview.jobId).select("title").lean();
    const jobTitle = (job as { title?: string } | null)?.title ?? "a position";
    const timeZone = await resolveRecipientTimeZone(seekerUserId);
    const when = formatZonedDateTime(body.scheduledAt as string, { timeZone, locale: seekerLocale });
    await notify({
      userId: seekerUserId,
      type: "interview_scheduled",
      title: "Interview Rescheduled",
      message: `Your interview for "${jobTitle}" has been rescheduled to ${when}. Please confirm your availability.`,
      link: localePath(seekerLocale, "/job-seeker/interviews"),
      // The reissued calendar invitation above is the email.
      sendEmail: false,
      metadata: { jobTitle, interviewId: params?.id, scheduledAt: body.scheduledAt },
    }).catch(() => { /* non-blocking */ });
  }

  // Outcome-based workflow transitions. Only an application still at or before
  // interviewing moves: an old round's result must not demote a candidate who
  // is already selected, on offer or hired.
  if (outcomeMovesApplication && outcomeApplication) {
    const application = outcomeApplication;
    const job = await Job.findById(interview.jobId).select("title employerId workflow").lean() as
      | (WorkflowSettingsCarrier & { title?: string; employerId?: unknown })
      | null;
    const jobTitle = job?.title ?? "a position";
    const employer = job?.employerId
      ? ((await Employer.findById(job.employerId).select("workflow").lean()) as WorkflowSettingsCarrier | null)
      : null;
    const { notifyOnStageChange } = resolveHiringRulesForJob(job, employer);
    const nextStatus = body.outcome === "failed" ? "rejected" : "selected";

    application.status = nextStatus;
    application.statusHistory = application.statusHistory || [];
    application.statusHistory.push({
      status: nextStatus,
      changedAt: new Date(),
      changedBy: ctx.userId as unknown as import("mongoose").Types.ObjectId,
      note: `Interview round ${interview.interviewRound ?? 1} ${body.outcome}`,
    });
    if (nextStatus === "rejected") application.rejectionReason = rejectionReason;
    await application.save();

    if (nextStatus === "rejected") {
      await closeOpenItemsForExit(application._id, "rejected", { actorRole: ctx.role });
    }

    if (notifyOnStageChange && seekerUserId) {
      const link = localePath(seekerLocale, "/job-seeker/applications");
      await notify(
        body.outcome === "failed"
          ? {
              userId: seekerUserId,
              type: "application_status_update",
              title: "Interview Result",
              message: `Thank you for interviewing for "${jobTitle}". Unfortunately, we have decided to move forward with other candidates at this time.`,
              link,
              sendEmail: true,
              metadata: { jobTitle, applicationId: String(application._id), outcome: "failed" },
            }
          : {
              userId: seekerUserId,
              type: "application_status_update",
              title: "Interview Cleared!",
              message: `Congratulations! You have cleared the round ${interview.interviewRound ?? 1} interview for "${jobTitle}". The employer will reach out with next steps soon.`,
              link,
              sendEmail: true,
              metadata: { jobTitle, applicationId: String(application._id), outcome: "passed" },
            },
      ).catch(() => { /* non-blocking */ });
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

  const accessError = await verifyInterviewAccess(interview, ctx);
  if (accessError) return accessError;

  // Same path as a PATCH cancel: SEQUENCE bump + ICS CANCEL, so the event
  // leaves the candidate's calendar, plus an in-app notice.
  const cancelled = await cancelInterview(interview._id);
  if (!cancelled && interview.status !== "cancelled") {
    return NextResponse.json({ error: "Only an open interview can be cancelled" }, { status: 409 });
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
