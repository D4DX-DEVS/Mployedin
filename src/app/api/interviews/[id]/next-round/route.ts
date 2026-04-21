import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const nextRoundSchema = z.object({
  scheduledAt: z.string().datetime().refine(
    (d) => new Date(d) > new Date(),
    { message: "Interview must be scheduled in the future" }
  ),
  duration: z.number().int().min(15).max(480).default(45),
  type: z.enum(["video", "offline", "hybrid"]).default("video"),
  location: z.string().max(500).optional(),
  meetLink: z.string().url().max(2048).optional().or(z.literal("")),
  instructions: z.string().max(2000).optional(),
});

async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) {
    return NextResponse.json({ error: "Invalid interview ID" }, { status: 400 });
  }

  await connectDB();

  const prevInterview = await Interview.findById(params!.id).lean();
  if (!prevInterview) {
    return NextResponse.json({ error: "Previous interview not found" }, { status: 404 });
  }

  if (prevInterview.status !== "completed" || prevInterview.outcome !== "passed") {
    return NextResponse.json(
      { error: "Can only schedule next round after a passed interview" },
      { status: 400 },
    );
  }

  const body = await validateBody(req, nextRoundSchema);
  const nextRound = (prevInterview.interviewRound ?? 1) + 1;

  const newInterview = await Interview.create({
    applicationId: prevInterview.applicationId,
    jobId: prevInterview.jobId,
    jobSeekerId: prevInterview.jobSeekerId,
    employerId: prevInterview.employerId,
    agentId: prevInterview.agentId,
    type: body.type,
    scheduledAt: new Date(body.scheduledAt),
    duration: body.duration ?? 45,
    location: body.location,
    meetLink: body.meetLink,
    instructions: body.instructions,
    status: "scheduled",
    interviewRound: nextRound,
    reminderSent: false,
    rescheduleCount: 0,
  });

  // Update application with new interview
  await Application.findByIdAndUpdate(prevInterview.applicationId, {
    $set: { status: "interview_scheduled" },
    $addToSet: { interviewIds: newInterview._id },
    $push: {
      statusHistory: {
        status: "interview_scheduled",
        changedAt: new Date(),
        changedBy: ctx.userId,
        note: `Round ${nextRound} interview scheduled`,
      },
    },
  });

  // Notify the candidate
  const jobSeeker = await JobSeeker.findById(prevInterview.jobSeekerId)
    .select("userId")
    .lean() as { userId?: unknown } | null;
  const job = await Job.findById(prevInterview.jobId)
    .select("title")
    .lean() as { title?: string } | null;
  const jobTitle = job?.title ?? "a position";

  if (jobSeeker?.userId) {
    await notify({
      userId: String(jobSeeker.userId),
      type: "interview_scheduled",
      title: `Round ${nextRound} Interview Scheduled`,
      message: `You have been moved to round ${nextRound} for "${jobTitle}". Check your interview details.`,
      link: `/en/job-seeker/interviews`,
      sendEmail: true,
      metadata: {
        jobTitle,
        interviewId: String(newInterview._id),
        round: nextRound,
        scheduledAt: body.scheduledAt,
      },
    }).catch(() => { /* non-blocking */ });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.next_round",
    resource: "interviews",
    resourceId: String(newInterview._id),
    meta: {
      previousInterviewId: params!.id,
      round: nextRound,
      scheduledAt: body.scheduledAt,
    },
    req,
  });

  return NextResponse.json({ interview: newInterview }, { status: 201 });
}

export const POST = withAuth(postHandler, { resource: "interviews", action: "create" });
