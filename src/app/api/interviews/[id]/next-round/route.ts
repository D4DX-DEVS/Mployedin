import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import { resolveMeetingLink } from "@/lib/interviews/meetingLink";
import { verifyInterviewAccess } from "@/lib/interviews/access";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import type { UserRole } from "@/models/User";
import {
  DEFAULT_INTERVIEW_MINUTES,
  conflictWindow,
  findOverlap,
  type ExistingInterview,
} from "@/lib/interviews/conflict";
import { FALLBACK_TIME_ZONE, formatZonedDateTime, isValidTimeZone } from "@/lib/datetime/zone";
import { addMinutes } from "date-fns";

interface AuthCtx { userId: string; role: UserRole; locale: string; member?: AuthContext["member"] }

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

  // Only the hiring side that owns this interview may book the next round — the
  // candidate never schedules their own, and nobody schedules on another
  // company's candidate.
  if (ctx.role === "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const accessError = await verifyInterviewAccess(prevInterview, ctx);
  if (accessError) return accessError;

  if (prevInterview.status !== "completed" || prevInterview.outcome !== "passed") {
    return NextResponse.json(
      { error: "Can only schedule next round after a passed interview" },
      { status: 400 },
    );
  }

  const body = await validateBody(req, nextRoundSchema);
  const nextRound = (prevInterview.interviewRound ?? 1) + 1;
  const reqDate = new Date(body.scheduledAt);
  const seekerDoc = await JobSeeker.findById(prevInterview.jobSeekerId)
    .select("settings")
    .lean() as {
      settings?: {
        instantBooking?: boolean;
        weeklyAvailability?: string[];
        availableHours?: { day: string; startTime: string; endTime: string }[];
        timeBuffer?: number;
        timezone?: string;
      };
    } | null;

  // A next round follows the same candidate availability rules as the first
  // round. Previously this shortcut only checked that the prior round passed,
  // so it could create an unavailable or overlapping booking.
  if (seekerDoc?.settings?.instantBooking) {
    const configuredTimeZone = seekerDoc.settings.timezone;
    const tz = isValidTimeZone(configuredTimeZone) ? configuredTimeZone : FALLBACK_TIME_ZONE;
    const localDayName = (() => {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return days[new Date(reqDate.toLocaleString("en-US", { timeZone: tz })).getDay()];
    })();
    const localStart = reqDate.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    const weekly = seekerDoc.settings.weeklyAvailability ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];
    if (!weekly.includes(localDayName)) {
      return NextResponse.json({ error: `Candidate is not available on ${localDayName}s (${tz})` }, { status: 409 });
    }
    const hours = seekerDoc.settings.availableHours?.find((entry) => entry.day === localDayName);
    if (hours) {
      const end = addMinutes(reqDate, body.duration ?? 45).toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
      if (localStart < hours.startTime || end > hours.endTime) {
        return NextResponse.json({ error: `Candidate is available ${hours.startTime}–${hours.endTime} ${tz} on ${localDayName}. Requested time ${localStart}–${end} is outside that window.` }, { status: 409 });
      }
    }
  }

  const duration = body.duration ?? DEFAULT_INTERVIEW_MINUTES;
  const buffer = seekerDoc?.settings?.timeBuffer ?? 30;
  const configuredTimeZone = seekerDoc?.settings?.timezone;
  const recipientTimeZone = isValidTimeZone(configuredTimeZone) ? configuredTimeZone : FALLBACK_TIME_ZONE;
  const { from, to } = conflictWindow(reqDate, duration, buffer);
  const interviewModel = Interview as unknown as {
    find?: (query: Record<string, unknown>) => { select: (fields: string) => { lean: () => Promise<unknown[]> } };
  };
  const nearby = interviewModel.find
    ? await interviewModel.find({
        jobSeekerId: prevInterview.jobSeekerId,
        status: { $in: ["scheduled", "confirmed"] },
        scheduledAt: { $gte: from, $lt: to },
      }).select("scheduledAt duration").lean()
    : [];
  if (findOverlap(reqDate, duration, buffer, nearby as ExistingInterview[])) {
    return NextResponse.json({ error: "Time slot conflicts with an existing interview (including buffer time)." }, { status: 409 });
  }

  const newInterview = await Interview.create({
    applicationId: prevInterview.applicationId,
    jobId: prevInterview.jobId,
    jobSeekerId: prevInterview.jobSeekerId,
    employerId: prevInterview.employerId,
    agentId: prevInterview.agentId,
    type: body.type,
    scheduledAt: new Date(body.scheduledAt),
    duration,
    location: body.location,
    meetLink: resolveMeetingLink(body.type, body.meetLink),
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
      title: "Interview Scheduled",
      message: `Your interview for "${jobTitle}" is scheduled. Check your interview details.`,
      link: `/job-seeker/interviews`,
      sendEmail: true,
      titleKey: "interviewScheduledTitle",
      bodyKey: "interviewScheduledBody",
      params: {
        jobTitle,
        location: body.location ?? "",
        dateIso: reqDate.toISOString(),
        date: formatZonedDateTime(reqDate, { timeZone: recipientTimeZone, locale: "en", dateStyle: "long" }),
        timeZone: recipientTimeZone,
      },
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
