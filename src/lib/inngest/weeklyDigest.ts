/**
 * Weekly Digest — Inngest Cron Function
 *
 * Runs Sunday 9 AM UTC. Aggregates the past week's activity per seeker:
 *   - applications submitted
 *   - interviews scheduled
 *   - profile views received
 *   - new matching jobs
 * Emits "notification/weekly-digest" events processed by the weekly digest worker.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import NotificationPreference, { getOrCreatePreferences } from "@/models/NotificationPreference";
import User from "@/models/User";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import ProfileView from "@/models/ProfileView";
import JobSeeker from "@/models/JobSeeker";
import { SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import { recentRecommendations } from "@/lib/matching/recommendationLog";
import { sendEmail } from "@/lib/communications/email";
import { unsubscribeUrl } from "@/lib/communications/unsubscribeLink";
import { isCronEnabled, updateCronRunStatus } from "@/models/SystemConfig";
import type { NotificationWeeklyDigestEvent } from "./events";

// ─── Cron: gather stats per seeker ────────────────────────────────────────────

export const weeklyDigestCron = inngest.createFunction(
  {
    id: "weekly-digest-cron",
    name: "Weekly Digest (Sunday 9 AM)",
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [{ cron: "0 9 * * 0" }], // Sunday 9 AM UTC
  },
  async ({ step }: { step: any }) => {
    await connectDB();

    // Check if admin has enabled this cron
    const enabled = await step.run("check-enabled", () => isCronEnabled("weeklyDigest"));
    if (!enabled) {
      await step.run("log-skipped", () => updateCronRunStatus("weeklyDigest", "success", "Skipped — disabled by admin"));
      return { skipped: true, reason: "disabled by admin" };
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch eligible seekers (weekly frequency + not unsubscribed)
    const seekerUsers = await step.run("fetch-seekers", async () => {
      const prefs = await NotificationPreference.find({
        emailFrequency: "weekly",
        unsubscribedAll: { $ne: true },
      })
        .select("userId")
        .lean();

      const userIds = prefs.map((p: { userId: string }) => p.userId);
      if (!userIds.length) return [];

      const users = await User.find({
        _id: { $in: userIds },
        role: "job_seeker",
        isActive: true,
      })
        .select("_id name email locale")
        .lean();

      return users.map((u: any) => ({
        userId: String(u._id),
        name: u.name ?? "Job Seeker",
        email: u.email,
        locale: u.locale ?? "en",
      }));
    });

    if (!seekerUsers.length) return { sent: 0, reason: "no weekly subscribers" };

    // Process in batches of 30
    const BATCH_SIZE = 30;
    let totalSent = 0;

    for (let i = 0; i < seekerUsers.length; i += BATCH_SIZE) {
      const batch = seekerUsers.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE);

      const count = await step.run(`process-batch-${batchIndex}`, async () => {
        let sent = 0;

        // One query for the whole batch instead of one per seeker.
        const batchSeekers = await JobSeeker.find({
          userId: { $in: batch.map((u: { userId: string }) => u.userId) },
        })
          .select(`userId ${SEEKER_MATCH_FIELDS}`)
          .lean();
        const seekerByUser = new Map(
          batchSeekers.map((d) => [String((d as { userId: unknown }).userId), d]),
        );

        for (const user of batch) {
          try {
            // Gather weekly stats. Application/Interview are keyed by the JobSeeker
            // profile _id, ProfileView by the User id — resolve the profile once and
            // scope each query to the id space it actually stores.
            const seeker = seekerByUser.get(user.userId);

            const [appCount, interviewCount, viewCount] = await Promise.all([
              seeker
                ? Application.countDocuments({
                    jobSeekerId: seeker._id,
                    appliedAt: { $gte: weekAgo },
                  })
                : 0,
              // Was filtering on `userId`, which Interview does not have — always 0.
              seeker
                ? Interview.countDocuments({
                    jobSeekerId: seeker._id,
                    scheduledAt: { $gte: weekAgo },
                  }).catch(() => 0)
                : 0,
              // Schema fields are `jobSeekerId` (a User id) and `viewedAt`;
              // `profileUserId` did not exist, so this always counted 0.
              ProfileView.countDocuments({
                jobSeekerId: user.userId,
                viewedAt: { $gte: weekAgo },
              }),
            ]);

            // Jobs we actually recommended this week — read from the log, not
            // re-scored here.
            //
            // This section used to run its own matching, at its own floor of
            // 40, against a projection of four fields that do not exist on the
            // Job schema. Now that a seeker's job matches arrive on their own
            // cadence (see digestGate.ts), re-scoring here would also mean two
            // emails carrying the same jobs in the same week. One email, one
            // meaning: this one summarises the week, the recommendation digest
            // carries the jobs.
            const topJobs = await recentRecommendations(user.userId, weekAgo);
            const newMatchingJobs = topJobs.length;

            // Skip if nothing to report
            if (appCount === 0 && interviewCount === 0 && viewCount === 0 && newMatchingJobs === 0) {
              continue;
            }

            // Build and send email directly (simpler than emitting another event)
            const html = buildWeeklyDigestEmail({
              userName: user.name,
              locale: user.locale,
              summary: {
                applicationsSubmitted: appCount,
                interviewsScheduled: interviewCount,
                profileViews: viewCount,
                newMatchingJobs,
              },
              topJobs,
              userId: user.userId,
            });

            const subject = user.locale === "ar"
              ? "ملخصك الأسبوعي من MPLOYEDIN"
              : "Your Weekly Summary — MPLOYEDIN";

            await sendEmail({
              to: user.email,
              subject,
              html,
              userId: user.userId,
            });

            sent++;
          } catch (err) {
            logger.error({ err, userId: user.userId }, "[weekly-digest] failed");
          }
        }

        return sent;
      });

      totalSent += count;
    }

    return { sent: totalSent, totalEligible: seekerUsers.length };
  },
);

// ─── Email Builder ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildWeeklyDigestEmail({
  userName,
  locale,
  summary,
  topJobs,
  userId,
}: {
  userName: string;
  locale: string;
  summary: { applicationsSubmitted: number; interviewsScheduled: number; profileViews: number; newMatchingJobs: number };
  topJobs: { title: string; company: string; matchScore: number }[];
  userId: string;
}): string {
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";
  // No category: this cron checks only `unsubscribedAll`, so a category-scoped
  // link would report success and change nothing. The footer used to carry
  // `?token=WEEKLY`, a literal no secret verifies — every click was an error page.
  const unsubHref = unsubscribeUrl(base, userId, { ref: "weekly" });
  const unsubLink = unsubHref
    ? `<a href="${unsubHref.replace(/&/g, "&amp;")}" style="color:#9ca3af;text-decoration:underline">${isAr ? "إلغاء الاشتراك" : "Unsubscribe"}</a>
      · `
    : "";

  const statRows = [
    { label: isAr ? "طلبات مقدمة" : "Applications Sent", value: summary.applicationsSubmitted, color: "#2563eb" },
    { label: isAr ? "مقابلات مجدولة" : "Interviews Scheduled", value: summary.interviewsScheduled, color: "#7c3aed" },
    { label: isAr ? "مشاهدات الملف" : "Profile Views", value: summary.profileViews, color: "#059669" },
    { label: isAr ? "وظائف مطابقة جديدة" : "New Matching Jobs", value: summary.newMatchingJobs, color: "#d97706" },
  ];

  const statsHtml = statRows
    .map(
      (s) => `
    <div style="flex:1;min-width:120px;text-align:center;padding:16px 8px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
      <div style="font-size:28px;font-weight:700;color:${s.color}">${s.value}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">${s.label}</div>
    </div>`,
    )
    .join("");

  const jobsHtml = topJobs.length
    ? `
    <div style="margin-top:24px">
      <h3 style="color:#111827;margin:0 0 12px;font-size:15px">${isAr ? "أفضل الوظائف المطابقة لك" : "Top Matching Jobs This Week"}</h3>
      ${topJobs
        .map(
          (j) => `
        <div style="padding:12px;margin-bottom:8px;background:#eff6ff;border-radius:8px;border:1px solid #dbeafe">
          <div style="font-weight:600;color:#1e40af;font-size:14px">${esc(j.title)}</div>
          <div style="color:#6b7280;font-size:12px;margin-top:2px">${esc(j.company)} · ${j.matchScore}% ${isAr ? "تطابق" : "match"}</div>
        </div>`,
        )
        .join("")}
    </div>`
    : "";

  return `
<!DOCTYPE html>
<html dir="${dir}" lang="${isAr ? "ar" : "en"}">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:linear-gradient(135deg,#0a2a6e,#1e40af);padding:28px 32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px">MPLOYEDIN</h1>
    <p style="color:#93c5fd;margin:8px 0 0;font-size:13px">${isAr ? "ملخصك الأسبوعي" : "Your Weekly Summary"}</p>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#374151;font-size:15px;margin:0 0 20px">${isAr ? `مرحباً ${esc(userName)}،` : `Hi ${esc(userName)},`}</p>
    <p style="color:#374151;font-size:14px;margin:0 0 20px">${isAr ? "إليك نشاطك خلال الأسبوع الماضي:" : "Here's your activity over the past week:"}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${statsHtml}</div>
    ${jobsHtml}
    <div style="text-align:center;margin-top:28px">
      <a href="${base}/${isAr ? "ar" : "en"}/job-seeker" style="display:inline-block;background:#0a2a6e;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600">
        ${isAr ? "افتح لوحة التحكم" : "Go to Dashboard"}
      </a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:11px;margin:0">
      ${unsubLink}© ${new Date().getFullYear()} MPLOYEDIN
    </p>
  </div>
</div>
</body>
</html>`;
}
