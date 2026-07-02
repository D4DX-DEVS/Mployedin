/**
 * Job Expiry Alerts for Seekers — Inngest Cron Function
 *
 * Runs daily at 8 AM UTC. Finds jobs expiring within the next 24 hours,
 * then notifies job seekers who have saved/bookmarked those jobs via
 * the SavedJob model.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import Job from "@/models/Job";
import SavedJob from "@/models/SavedJob";
import User from "@/models/User";
import NotificationPreference from "@/models/NotificationPreference";
import { sendEmail } from "@/lib/communications/email";
import { isCronEnabled, updateCronRunStatus } from "@/models/SystemConfig";

export const jobExpiryAlertsCron = inngest.createFunction(
  {
    id: "job-expiry-alerts-seekers",
    name: "Job Expiry Alerts for Seekers (8 AM)",
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [{ cron: "0 8 * * *" }], // 8 AM UTC daily
  },
  async ({ step }: { step: any }) => {
    await step.run("connect-db", () => connectDB());

    // Check if admin has enabled this cron
    const enabled = await step.run("check-enabled", () => isCronEnabled("jobExpiryAlerts"));
    if (!enabled) {
      await step.run("log-skipped", () => updateCronRunStatus("jobExpiryAlerts", "success", "Skipped — disabled by admin"));
      return { skipped: true, reason: "disabled by admin" };
    }

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find jobs expiring in the next 24 hours that are still active
    const expiringJobs = await step.run("fetch-expiring-jobs", async () => {
      const jobs = await Job.find({
        status: "active",
        expiresAt: { $gte: now, $lte: in24h },
      })
        .select("_id title employerName location")
        .lean();

      return jobs.map((j: any) => ({
        _id: String(j._id),
        title: j.title,
        company: j.employerName ?? "",
        location: j.location ?? "",
      }));
    });

    if (!expiringJobs.length) {
      return { notified: 0, reason: "no jobs expiring in 24h" };
    }

    const jobIds = expiringJobs.map((j: { _id: string }) => j._id);

    // Find all seekers who saved these jobs
    const savedEntries = await step.run("fetch-saved-jobs", async () => {
      const saved = await SavedJob.find({ jobId: { $in: jobIds } })
        .select("jobSeekerId jobId")
        .lean();

      return saved.map((s: any) => ({
        seekerUserId: String(s.jobSeekerId), // jobSeekerId references User._id
        jobId: String(s.jobId),
      }));
    });

    if (!savedEntries.length) {
      return { notified: 0, reason: "no seekers saved expiring jobs" };
    }

    // Group by seeker: each seeker gets ONE email with all their expiring saved jobs
    const seekerJobMap = new Map<string, string[]>();
    for (const entry of savedEntries) {
      const existing = seekerJobMap.get(entry.seekerUserId) ?? [];
      existing.push(entry.jobId);
      seekerJobMap.set(entry.seekerUserId, existing);
    }

    const seekerIds = [...seekerJobMap.keys()];

    // Filter out unsubscribed seekers
    const notified = await step.run("send-alerts", async () => {
      let sent = 0;

      // Fetch users + prefs in bulk
      const [users, prefs] = await Promise.all([
        User.find({ _id: { $in: seekerIds }, isActive: true })
          .select("_id name email locale")
          .lean(),
        NotificationPreference.find({
          userId: { $in: seekerIds },
          unsubscribedAll: { $ne: true },
          "categories.jobs.enabled": { $ne: false },
        })
          .select("userId emailFrequency")
          .lean(),
      ]);

      const prefSet = new Set(prefs.map((p: any) => String(p.userId)));
      const jobMap = new Map(expiringJobs.map((j: any) => [j._id, j]));

      for (const user of users as any[]) {
        const uid = String(user._id);

        // Skip if no preference or unsubscribed from jobs
        if (!prefSet.has(uid)) continue;

        const savedJobIds = seekerJobMap.get(uid);
        if (!savedJobIds?.length) continue;

        const jobs = savedJobIds
          .map((id) => jobMap.get(id))
          .filter(Boolean) as { _id: string; title: string; company: string; location: string }[];

        if (!jobs.length) continue;

        try {
          const isAr = user.locale === "ar";
          const name = user.name ?? "Job Seeker";
          const base = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";

          const jobListHtml = jobs
            .map(
              (j) => `
            <div style="padding:12px;margin-bottom:8px;background:#fef3c7;border-radius:8px;border:1px solid #fcd34d">
              <div style="font-weight:600;color:#92400e;font-size:14px">${esc(j.title)}</div>
              <div style="color:#78716c;font-size:12px;margin-top:2px">${esc(j.company)}${j.location ? ` · ${esc(j.location)}` : ""}</div>
            </div>`,
            )
            .join("");

          const html = `
<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:linear-gradient(135deg,#92400e,#d97706);padding:24px 32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">⏰ ${isAr ? "وظائف محفوظة ستنتهي قريباً" : "Saved Jobs Expiring Soon"}</h1>
  </div>
  <div style="padding:24px 32px">
    <p style="color:#374151;font-size:15px;margin:0 0 16px">${isAr ? `مرحباً ${esc(name)}،` : `Hi ${esc(name)},`}</p>
    <p style="color:#374151;font-size:14px;margin:0 0 16px">
      ${isAr
        ? `${jobs.length === 1 ? "وظيفة واحدة" : `${jobs.length} وظائف`} من وظائفك المحفوظة ستنتهي خلال 24 ساعة. قدم الآن قبل فوات الأوان!`
        : `${jobs.length} of your saved job${jobs.length > 1 ? "s" : ""} will expire within 24 hours. Apply now before it's too late!`}
    </p>
    ${jobListHtml}
    <div style="text-align:center;margin-top:20px">
      <a href="${base}/${isAr ? "ar" : "en"}/job-seeker/saved-jobs" style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600">
        ${isAr ? "عرض الوظائف المحفوظة" : "View Saved Jobs"}
      </a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:14px 32px;text-align:center;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:11px;margin:0">
      <a href="${base}/api/unsubscribe?token=EXPIRY" style="color:#9ca3af;text-decoration:underline">${isAr ? "إلغاء الاشتراك" : "Unsubscribe"}</a>
      · © ${new Date().getFullYear()} MPLOYEDIN
    </p>
  </div>
</div>
</body>
</html>`;

          await sendEmail({
            to: user.email,
            subject: isAr
              ? `⏰ ${jobs.length} ${jobs.length === 1 ? "وظيفة محفوظة" : "وظائف محفوظة"} ستنتهي قريباً`
              : `⏰ ${jobs.length} saved job${jobs.length > 1 ? "s" : ""} expiring soon`,
            html,
            userId: uid,
          });

          sent++;
        } catch (err) {
          logger.error({ err, userId: uid }, "[job-expiry-alert] failed");
        }
      }

      return sent;
    });

    return { notified, expiringJobs: expiringJobs.length, seekersWithSaves: seekerIds.length };
  },
);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
