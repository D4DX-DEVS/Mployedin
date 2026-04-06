import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import { notify } from "@/lib/notifications/trigger";

// SLA alert cron — notifies employers when candidates are stalled in a stage for too long
// Run daily. Threshold: 7 days in same non-final stage.

const FINAL_STATUSES = ["rejected", "selected", "hired", "withdrawn"];
const STALE_DAYS = 7;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const now = new Date();
  const threshold = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Find applications stuck in non-final stages for > STALE_DAYS
  const staleApps = await Application.find({
    status: { $nin: FINAL_STATUSES },
    updatedAt: { $lte: threshold },
  })
    .select("_id status employerId jobId updatedAt")
    .populate("jobId", "title")
    .lean();

  if (!staleApps.length) {
    return NextResponse.json({ success: true, alerted: 0, timestamp: now.toISOString() });
  }

  // Group by employer
  const byEmployer = staleApps.reduce<Record<string, typeof staleApps>>((acc, app) => {
    const empId = String(app.employerId);
    if (!acc[empId]) acc[empId] = [];
    acc[empId].push(app);
    return acc;
  }, {});

  let alerted = 0;
  const errors: string[] = [];

  for (const [employerId, apps] of Object.entries(byEmployer)) {
    try {
      const employer = await Employer.findById(employerId).select("userId").lean();
      if (!employer) continue;
      const user = await User.findById(employer.userId).select("_id").lean();
      if (!user) continue;

      const count = apps.length;
      const jobTitle = (apps[0].jobId as { title?: string } | null)?.title ?? "a job";

      await notify({
        userId: String(user._id),
        type: "system",
        title: `${count} candidate${count > 1 ? "s" : ""} need${count === 1 ? "s" : ""} attention`,
        message: `You have ${count} application${count > 1 ? "s" : ""} that ${count > 1 ? "have" : "has"} been in the same stage for over ${STALE_DAYS} days (e.g. "${jobTitle}"). Review and move them forward.`,
        link: `/employer/applications`,
        sendEmail: true,
      });

      alerted++;
    } catch (err) {
      errors.push(`Employer ${employerId}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  return NextResponse.json({
    success: true,
    staleApplications: staleApps.length,
    employersAlerted: alerted,
    errors: errors.length ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
