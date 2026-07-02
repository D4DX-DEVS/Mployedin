import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Interview from "@/models/Interview";
import { notifyInterviewScheduled } from "@/lib/notifications/trigger";
import { notify } from "@/lib/notifications/trigger";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { forEachBounded } from "@/lib/cron/scale";
import logger from "@/lib/logger";

// This route is meant to be called by a cron job (e.g. Vercel Cron, external scheduler)
// Secured with a shared CRON_SECRET header

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);

  // ── 24-hour reminders ────────────────────────────────────────────
  const upcomingInterviews = await Interview.find({
    scheduledAt: { $gte: now, $lte: in24Hours },
    status: { $in: ["scheduled", "confirmed"] },
    reminderSent: { $ne: true },
  })
    .limit(500)
    .populate({
      path: "jobSeekerId",
      select: "userId",
      populate: { path: "userId", select: "_id" },
    })
    .populate("jobId", "title")
    .select("_id jobSeekerId jobId scheduledAt location reminderSent")
    .lean();

  let remindedCount = 0;
  const errors: string[] = [];

  const result24h = await forEachBounded(upcomingInterviews, 10, async (interview) => {
    const candidate = interview.jobSeekerId as { userId?: { _id?: string } };
    const job = interview.jobId as { title: string };
    const scheduledAt = new Date(interview.scheduledAt as string);

    if (!candidate.userId?._id) {
      throw new Error("job seeker user not found");
    }

    // Claim this interview for notification (mark first for idempotency)
    const claimed = await Interview.updateOne(
      { _id: interview._id, reminderSent: { $ne: true } },
      { $set: { reminderSent: true, reminderSentAt: now } }
    );

    if (claimed.modifiedCount !== 1) {
      return; // Already claimed by another run
    }

    await notifyInterviewScheduled(
      candidate.userId._id.toString(),
      job?.title ?? "Interview",
      scheduledAt,
      (interview as { location?: string }).location ?? "TBD",
      interview._id.toString()
    );
  }, "interview-24h-reminder");

  remindedCount = result24h.ok;
  if (result24h.failed > 0) {
    errors.push(`24h reminders: ${result24h.failed} failed`);
  }

  // ── 1-hour reminders ─────────────────────────────────────────────
  const soonInterviews = await Interview.find({
    scheduledAt: { $gte: now, $lte: in1Hour },
    status: { $in: ["scheduled", "confirmed"] },
    reminderSent: true, // 24h reminder already sent
    "metadata.oneHourReminderSent": { $ne: true },
  })
    .limit(500)
    .populate({
      path: "jobSeekerId",
      select: "userId",
      populate: { path: "userId", select: "_id" },
    })
    .populate("jobId", "title")
    .select("_id jobSeekerId jobId scheduledAt meetLink metadata")
    .lean();

  const result1h = await forEachBounded(soonInterviews, 10, async (interview) => {
    const candidate = interview.jobSeekerId as { userId?: { _id?: string } };
    const job = interview.jobId as { title?: string };
    const scheduledAt = new Date(interview.scheduledAt as string);
    const meetLink = (interview as { meetLink?: string }).meetLink;

    if (!candidate.userId?._id) {
      throw new Error("job seeker user not found");
    }

    // Claim this interview for notification (mark first for idempotency)
    const claimed = await Interview.updateOne(
      { _id: interview._id, "metadata.oneHourReminderSent": { $ne: true } },
      { $set: { "metadata.oneHourReminderSent": true } }
    );

    if (claimed.modifiedCount !== 1) {
      return; // Already claimed by another run
    }

    const minutesUntil = Math.round((scheduledAt.getTime() - now.getTime()) / 60000);

    await notify({
      userId: candidate.userId._id.toString(),
      type: "interview_reminder",
      title: "Interview Starting Soon",
      message: `Your interview for "${job?.title ?? "a position"}" starts in ${minutesUntil} minutes.${meetLink ? ` Join: ${meetLink}` : ""}`,
      link: `/en/job-seeker/interviews`,
      sendEmail: true,
      metadata: { interviewId: String(interview._id), minutesUntil },
    });
  }, "interview-1h-reminder");

  if (result1h.failed > 0) {
    errors.push(`1h reminders: ${result1h.failed} failed`);
  }

  return NextResponse.json({
    success: true,
    processed: upcomingInterviews.length + soonInterviews.length,
    reminded24h: remindedCount,
    reminded1h: result1h.ok,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
