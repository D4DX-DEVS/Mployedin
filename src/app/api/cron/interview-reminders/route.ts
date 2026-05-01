import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Interview from "@/models/Interview";
import { notifyInterviewScheduled } from "@/lib/notifications/trigger";
import { notify } from "@/lib/notifications/trigger";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import JobSeeker from "@/models/JobSeeker";

// This route is meant to be called by a cron job (e.g. Vercel Cron, external scheduler)
// Secured with a shared CRON_SECRET header

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
    .populate({
      path: "jobSeekerId",
      select: "userId",
      populate: { path: "userId", select: "_id name email" },
    })
    .populate("jobId", "title")
    .lean();

  let remindedCount = 0;
  const errors: string[] = [];

  for (const interview of upcomingInterviews) {
    try {
      const candidate = interview.jobSeekerId as { userId?: { _id?: string; name?: string; email?: string } };
      const job = interview.jobId as { title: string };
      const scheduledAt = new Date(interview.scheduledAt as string);

      if (!candidate.userId?._id) {
        errors.push(`Interview ${interview._id}: job seeker user not found`);
        continue;
      }

      await notifyInterviewScheduled(
        candidate.userId._id.toString(),
        job?.title ?? "Interview",
        scheduledAt,
        (interview as { location?: string }).location ?? "TBD",
        interview._id.toString()
      );

      // Mark reminder as sent
      await Interview.findByIdAndUpdate(interview._id, {
        reminderSent: true,
        reminderSentAt: now,
      });

      remindedCount++;
    } catch (err) {
      errors.push(`Interview ${interview._id}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // ── 1-hour reminders ─────────────────────────────────────────────
  const soonInterviews = await Interview.find({
    scheduledAt: { $gte: now, $lte: in1Hour },
    status: { $in: ["scheduled", "confirmed"] },
    reminderSent: true, // 24h reminder already sent
    "metadata.oneHourReminderSent": { $ne: true },
  })
    .populate({
      path: "jobSeekerId",
      select: "userId",
      populate: { path: "userId", select: "_id name email" },
    })
    .populate("jobId", "title")
    .lean();

  let oneHourRemindedCount = 0;

  for (const interview of soonInterviews) {
    try {
      const candidate = interview.jobSeekerId as { userId?: { _id?: string } };
      const job = interview.jobId as { title?: string };
      const scheduledAt = new Date(interview.scheduledAt as string);
      const meetLink = (interview as { meetLink?: string }).meetLink;

      if (!candidate.userId?._id) continue;

      const minutesUntil = Math.round((scheduledAt.getTime() - now.getTime()) / 60000);

      await notify({
        userId: candidate.userId._id.toString(),
        type: "interview_reminder",
        title: "Interview Starting Soon",
        message: `Your interview for "${job?.title ?? "a position"}" starts in ${minutesUntil} minutes.${meetLink ? ` Join: ${meetLink}` : ""}`,
        link: `/en/job-seeker/interviews`,
        sendEmail: true,
        metadata: { interviewId: String(interview._id), minutesUntil },
      }).catch(() => {});

      await Interview.findByIdAndUpdate(interview._id, {
        $set: { "metadata.oneHourReminderSent": true },
      });

      oneHourRemindedCount++;
    } catch (err) {
      errors.push(`1h-reminder ${interview._id}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return NextResponse.json({
    success: true,
    processed: upcomingInterviews.length + soonInterviews.length,
    reminded24h: remindedCount,
    reminded1h: oneHourRemindedCount,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
