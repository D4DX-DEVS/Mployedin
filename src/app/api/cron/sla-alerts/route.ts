import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import { notify } from "@/lib/notifications/trigger";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { forEachBounded, byId } from "@/lib/cron/scale";
import logger from "@/lib/logger";

// SLA alert cron — notifies employers when candidates are stalled in a stage for too long
// Run daily. Threshold: 7 days in same non-final stage.

const FINAL_STATUSES = ["rejected", "selected", "hired", "withdrawn"];
const STALE_DAYS = 7;

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  const threshold = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Find applications stuck in non-final stages for > STALE_DAYS
  const staleApps = await Application.find({
    status: { $nin: FINAL_STATUSES },
    updatedAt: { $lte: threshold },
    slaAlertSentAt: { $exists: false },
  })
    .limit(500)
    .select("_id status employerId jobId updatedAt")
    .populate("jobId", "title")
    .lean();

  if (!staleApps.length) {
    return NextResponse.json({ success: true, alerted: 0, timestamp: now.toISOString() });
  }

  // Mark all fetched apps as processed BEFORE notifying
  const appIds = staleApps.map((a) => a._id);
  await Application.updateMany({ _id: { $in: appIds } }, { $set: { slaAlertSentAt: now } });

  // Group by employer
  const byEmployer = staleApps.reduce<Record<string, typeof staleApps>>((acc, app) => {
    const empId = String(app.employerId);
    if (!acc[empId]) acc[empId] = [];
    acc[empId].push(app);
    return acc;
  }, {});

  // Batch fetch all employer and user docs
  const employerIds = Object.keys(byEmployer);
  const employers = await Employer.find({ _id: { $in: employerIds } })
    .select("_id userId")
    .lean();
  const employerMap = byId(employers);

  const userIds = employers.map((e) => e.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id")
    .lean();
  const userMap = byId(users);

  // Group notifications by user
  const notificationsToSend: { userId: string; apps: typeof staleApps }[] = [];
  for (const [employerId, apps] of Object.entries(byEmployer)) {
    const employer = employerMap.get(employerId);
    if (!employer) continue;
    const user = userMap.get(String(employer.userId));
    if (!user) continue;
    notificationsToSend.push({ userId: String(user._id), apps });
  }

  // Send with bounded concurrency
  const { ok: alerted, failed } = await forEachBounded(
    notificationsToSend,
    10,
    async ({ userId, apps }) => {
      const count = apps.length;
      const jobTitle = (apps[0].jobId as { title?: string } | null)?.title ?? "a job";

      await notify({
        userId,
        type: "system",
        title: `${count} candidate${count > 1 ? "s" : ""} need${count === 1 ? "s" : ""} attention`,
        message: `You have ${count} application${count > 1 ? "s" : ""} that ${count > 1 ? "have" : "has"} been in the same stage for over ${STALE_DAYS} days (e.g. "${jobTitle}"). Review and move them forward.`,
        link: `/employer/applications`,
        sendEmail: true,
      });
    },
    "sla-alerts"
  );

  if (failed > 0) {
    logger.warn({ alerted, failed }, "[cron] SLA alerts completed with failures");
  }

  return NextResponse.json({
    success: true,
    staleApplications: staleApps.length,
    employersAlerted: alerted,
    errors: failed > 0 ? [`${failed} notifications failed`] : undefined,
    timestamp: now.toISOString(),
  });
}
