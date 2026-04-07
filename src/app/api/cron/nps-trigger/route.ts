import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import { CandidateNPS } from "@/models/CandidateNPS";
import JobSeeker from "@/models/JobSeeker";
import { notify } from "@/lib/notifications/trigger";

const TERMINAL_STATUSES = ["hired", "rejected", "withdrawn"];
const WINDOW_HOURS = 24;       // send NPS request after 24h
const MAX_WINDOW_DAYS = 14;    // don't send if final status >14 days ago (too late)

/**
 * GET /api/cron/nps-trigger
 *
 * Called by Vercel Cron daily.
 * Finds applications that reached a terminal status 24h-14d ago with no NPS submitted
 * and sends an in-app + email notification asking for feedback.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ""}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const now = new Date();
  const windowStart = new Date(now.getTime() - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000);

  // Find terminal applications in the send window
  const applications = await Application.find({
    status: { $in: TERMINAL_STATUSES },
    updatedAt: { $gte: windowStart, $lte: windowEnd },
  })
    .select("_id jobSeekerId jobId employerId status updatedAt")
    .populate("jobId", "title")
    .populate("employerId", "companyName")
    .lean();

  if (applications.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  // Filter out applications that already have NPS
  const appIds = applications.map((a) => a._id);
  const existingNPS = await CandidateNPS.find({
    applicationId: { $in: appIds },
  })
    .select("applicationId")
    .lean();

  const alreadyRated = new Set(existingNPS.map((n) => String(n.applicationId)));

  const toNotify = applications.filter(
    (a) => !alreadyRated.has(String(a._id))
  );

  let sent = 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";

  for (const app of toNotify) {
    try {
      // Get the job seeker's userId
      const seeker = await JobSeeker.findById(app.jobSeekerId)
        .select("userId")
        .lean();
      if (!seeker?.userId) continue;

      const job = app.jobId as { title?: string } | null;
      const employer = app.employerId as { companyName?: string } | null;
      const jobTitle = job?.title ?? "the position";
      const companyName = employer?.companyName ?? "the company";

      const statusLabel =
        app.status === "hired"
          ? "hired"
          : app.status === "rejected"
          ? "not selected"
          : "withdrawn";

      await notify({
        userId: String(seeker.userId),
        type: "system",
        title: "How was your experience?",
        message: `You were ${statusLabel} for "${jobTitle}" at ${companyName}. Share your feedback to help improve the hiring process.`,
        link: `${appUrl}/en/job-seeker/applications/${String(app._id)}/feedback`,
        sendEmail: true,
      });

      sent++;
    } catch (err) {
      console.error(`[NPS Trigger] Failed for app ${app._id}:`, err);
    }
  }

  return NextResponse.json({ sent, total: toNotify.length });
}
