import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import JobSeeker from "@/models/JobSeeker";
import { Employer } from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { z } from "zod";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

const interviewRespondSchema = z
  .object({
    response: z.enum(["confirmed", "declined", "reschedule_requested"]),
    rescheduleNote: z.string().max(500).trim().optional(),
  })
  .refine(
    (data) => data.response !== "reschedule_requested" || !!data.rescheduleNote,
    {
      message: "Reschedule reason is required when requesting reschedule",
      path: ["rescheduleNote"],
    }
  );

// POST /api/interviews/[id]/respond — candidate confirms/declines/reschedules
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can respond to interviews" }, { status: 403 });
  }

  await connectDB();

  const interview = await Interview.findById(params?.id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  // Verify ownership: job seeker must own this interview
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker || String(interview.jobSeekerId) !== String(seeker._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only allow responding to scheduled interviews
  if (!["scheduled", "rescheduled"].includes(interview.status)) {
    return NextResponse.json(
      { error: "Can only respond to scheduled or rescheduled interviews" },
      { status: 400 }
    );
  }

  const body = await validateBody(req, interviewRespondSchema);
  const { response, rescheduleNote } = body;

  const prevResponse = interview.candidateResponse;
  interview.candidateResponse = response;
  interview.candidateResponseAt = new Date();

  if (response === "confirmed") {
    interview.status = "confirmed";
  } else if (response === "reschedule_requested") {
    interview.candidateRescheduleNote = rescheduleNote;
  }

  await interview.save();

  // Notify employer
  const employer = await Employer.findById(interview.employerId).select("userId").lean();
  if (employer) {
    const responseLabel =
      response === "confirmed" ? "confirmed" :
      response === "declined" ? "declined" :
      "requested a reschedule for";

    await notify({
      userId: String(employer.userId),
      type: "interview_update",
      title: `Interview ${response === "confirmed" ? "Confirmed" : response === "declined" ? "Declined" : "Reschedule Requested"}`,
      message: `A candidate has ${responseLabel} their interview.${rescheduleNote ? ` Note: ${rescheduleNote}` : ""}`,
      link: `/en/employer/interviews`,
      sendEmail: true,
      metadata: { interviewId: params?.id, response },
    }).catch(() => {});
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.respond",
    resource: "interviews",
    resourceId: params?.id,
    changes: { before: { candidateResponse: prevResponse }, after: { candidateResponse: response } },
    meta: { rescheduleNote },
    req,
  });

  return NextResponse.json({ interview });
}

export const POST = withAuth(postHandler, { resource: "interviews", action: "read" });
