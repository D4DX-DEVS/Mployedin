import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Interview from "@/models/Interview";
import { notifyInterviewScheduled } from "@/lib/notifications/trigger";

// This route is meant to be called by a cron job (e.g. Vercel Cron, external scheduler)
// Secured with a shared CRON_SECRET header

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find interviews scheduled within the next 24 hours that haven't been reminded
  const upcomingInterviews = await Interview.find({
    scheduledAt: { $gte: now, $lte: in24Hours },
    status: "scheduled",
    reminderSent: { $ne: true },
  })
    .populate("jobSeekerId", "name email phone")
    .populate("jobId", "title")
    .lean();

  let remindedCount = 0;
  const errors: string[] = [];

  for (const interview of upcomingInterviews) {
    try {
      const candidate = interview.jobSeekerId as { _id: string; name: string; email: string };
      const job = interview.jobId as { title: string };
      const scheduledAt = new Date(interview.scheduledAt as string);

      await notifyInterviewScheduled(
        candidate._id.toString(),
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

  return NextResponse.json({
    success: true,
    processed: upcomingInterviews.length,
    reminded: remindedCount,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
