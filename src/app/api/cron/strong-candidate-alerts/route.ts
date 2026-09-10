import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import { notify } from "@/lib/notifications/trigger";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { forEachBounded, byId } from "@/lib/cron/scale";
import { STRONG_MATCH_THRESHOLD } from "@/lib/hiring/workflowSettings";
import logger from "@/lib/logger";

// Strong candidate alerts cron — notifies employers when high-scoring applications arrive
// Run hourly. Threshold: applications with aiMatchScore >= 80 in the last 7 days.

const LOOKBACK_DAYS = 7;

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  const cutoffDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Find strong applications (score >= 80) that have not yet triggered an alert
  const strongApps = await Application.find({
    status: "applied",
    aiMatchScore: { $gte: STRONG_MATCH_THRESHOLD },
    strongAlertSentAt: null, // matches missing and null alike
    appliedAt: { $gte: cutoffDate },
  })
    .limit(500)
    .select("_id employerId jobId aiMatchScore appliedAt")
    .populate("jobId", "title")
    .lean();

  if (!strongApps.length) {
    return NextResponse.json({
      success: true,
      candidates: 0,
      notificationsSent: 0,
      timestamp: now.toISOString(),
    });
  }

  // Mark all fetched apps as processed BEFORE notifying (prevents double-send on retry)
  const appIds = strongApps.map((a) => a._id);
  await Application.updateMany({ _id: { $in: appIds } }, { $set: { strongAlertSentAt: now } });

  // Group by employer, then by job within each employer
  const byEmployer = strongApps.reduce<
    Record<string, Record<string, Array<(typeof strongApps)[number]>>>
  >((acc, app) => {
    const empId = String(app.employerId);
    if (!acc[empId]) acc[empId] = {};

    const jobId = String(app.jobId?._id ?? "unknown");
    if (!acc[empId][jobId]) acc[empId][jobId] = [];
    acc[empId][jobId].push(app);

    return acc;
  }, {});

  // Batch fetch all employers
  const employerIds = Object.keys(byEmployer);
  const employers = await Employer.find({ _id: { $in: employerIds } })
    .select("_id userId notificationPrefs")
    .lean();
  const employerMap = byId(employers);

  // Prepare notifications: one per (employer, job) pair
  const notificationsToSend: {
    userId: string;
    jobId: string;
    jobTitle: string;
    count: number;
  }[] = [];

  for (const [employerId, jobsMap] of Object.entries(byEmployer)) {
    const employer = employerMap.get(employerId);
    if (!employer) continue;

    for (const [jobId, apps] of Object.entries(jobsMap)) {
      const jobTitle = (apps[0]?.jobId as { title?: string } | null)?.title ?? "a job";
      notificationsToSend.push({
        userId: String(employer.userId),
        jobId,
        jobTitle,
        count: apps.length,
      });
    }
  }

  // Send with bounded concurrency
  const { ok: notificationsSent, failed } = await forEachBounded(
    notificationsToSend,
    10,
    async ({ userId, jobId, jobTitle, count }) => {
      // Find the employer to check notification preferences
      const employer = employers.find((e) => String(e.userId) === userId);
      const sendEmail = employer?.notificationPrefs?.emailNewApplicant !== false;

      await notify({
        userId,
        type: "application_received",
        title: `${count} strong candidate${count === 1 ? "" : "s"} for ${jobTitle}`,
        message: `${count} new applicant${count === 1 ? "" : "s"} scored ${STRONG_MATCH_THRESHOLD}%+ for "${jobTitle}". Review them while they are still available.`,
        link: `/employer/jobs/${jobId}/applications?scoreMin=${STRONG_MATCH_THRESHOLD}&sort=score`,
        sendEmail,
        titleKey: "strongCandidatesTitle",
        bodyKey: "strongCandidatesBody",
        params: { count, jobTitle, threshold: STRONG_MATCH_THRESHOLD },
      });
    },
    "strong-candidate-alerts"
  );

  if (failed > 0) {
    logger.warn({ notificationsSent, failed }, "[cron] Strong candidate alerts completed with failures");
  }

  return NextResponse.json({
    success: true,
    candidates: strongApps.length,
    notificationsSent,
    errors: failed > 0 ? [`${failed} notifications failed`] : undefined,
    timestamp: now.toISOString(),
  });
}
