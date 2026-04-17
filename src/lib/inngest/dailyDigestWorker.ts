/**
 * Daily Digest Worker — Inngest Function
 *
 * Triggered by "notification/daily-digest" events emitted by the daily
 * recommendations cron. Combines job recommendations + profile views
 * into ONE email per user. Never sends multiple separate emails.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import NotificationPreference from "@/models/NotificationPreference";
import { sendEmail } from "@/lib/communications/email";
import type { NotificationDailyDigestEvent } from "./events";

export const dailyDigestWorker = inngest.createFunction(
  {
    id: "daily-digest-worker",
    name: "Daily Digest Email Worker",
    retries: 3,
    concurrency: { limit: 15 },
    triggers: [{ event: "notification/daily-digest" }],
  },
  async ({ event, step }: { event: { data: NotificationDailyDigestEvent["data"] }; step: any }) => {
    const { userId, userName, email, locale, jobs, profileViews } = event.data;

    await step.run("connect-db", () => connectDB());

    // Build and send the combined digest email
    await step.run("send-digest-email", async () => {
      const html = buildDigestEmail({
        userName,
        locale,
        jobs,
        profileViews,
      });

      const jobCount = jobs.length;
      const viewCount = profileViews.count;

      let subject: string;
      if (locale === "ar") {
        subject =
          jobCount > 0 && viewCount > 0
            ? `${jobCount} وظائف جديدة + ${viewCount} مشاهدات لملفك الشخصي`
            : jobCount > 0
              ? `${jobCount} وظائف مطابقة لملفك الشخصي`
              : `${viewCount} مسؤولي توظيف شاهدوا ملفك الشخصي`;
      } else {
        subject =
          jobCount > 0 && viewCount > 0
            ? `${jobCount} new job matches + ${viewCount} profile views`
            : jobCount > 0
              ? `${jobCount} jobs matching your profile`
              : `${viewCount} recruiters viewed your profile`;
      }

      await sendEmail({
        to: email,
        subject,
        html,
      });
    });

    // Update last digest timestamp
    await step.run("update-digest-timestamp", async () => {
      await NotificationPreference.updateOne(
        { userId },
        {
          $set: {
            lastDigestSentAt: new Date(),
            lastEmailSentAt: new Date(),
          },
        },
        { upsert: true },
      );
    });

    return { sent: true, userId, jobCount: jobs.length, viewCount: profileViews.count };
  },
);

interface DigestEmailData {
  userName: string;
  locale: string;
  jobs: Array<{
    jobId: string;
    title: string;
    company: string;
    location: string;
    matchScore: number;
    salary?: { min: number; max: number };
  }>;
  profileViews: {
    count: number;
    viewers: Array<{ name: string; role: string }>;
  };
}

function buildDigestEmail(data: DigestEmailData): string {
  const { userName, locale, jobs, profileViews } = data;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const greeting = isAr
    ? `مرحباً <strong>${esc(userName)}</strong>`
    : `Hi <strong>${esc(userName)}</strong>`;

  const jobsTitle = isAr ? "وظائف مطابقة لك" : "Jobs matching your profile";
  const viewsTitle = isAr
    ? "مسؤولو التوظيف شاهدوا ملفك"
    : "Recruiters viewed your profile";

  // Job cards
  const jobCards = jobs
    .map((j) => {
      const salaryText =
        j.salary && j.salary.max > 0
          ? `${j.salary.min.toLocaleString()}–${j.salary.max.toLocaleString()} AED`
          : "";
      const matchColor =
        j.matchScore >= 80
          ? "#059669"
          : j.matchScore >= 60
            ? "#d97706"
            : "#6b7280";

      return `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <a href="${baseUrl}/${locale}/job-seeker/jobs/${j.jobId}" style="color: #0D6FD8; text-decoration: none; font-weight: 600; font-size: 15px;">${esc(j.title)}</a>
              <p style="margin: 4px 0 0; color: #6b7280; font-size: 13px;">${esc(j.company)} · ${esc(j.location || "Remote")}</p>
              ${salaryText ? `<p style="margin: 2px 0 0; color: #374151; font-size: 13px;">${salaryText}</p>` : ""}
            </div>
            <span style="background: ${matchColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap;">${j.matchScore}% ${isAr ? "تطابق" : "match"}</span>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  // Profile views section
  const viewsSection =
    profileViews.count > 0
      ? `
    <div style="margin-top: 24px;">
      <h3 style="color: #111827; font-size: 16px; margin: 0 0 12px;">👁 ${viewsTitle}</h3>
      <div style="background: #eff6ff; padding: 16px; border-radius: 8px; border-left: 4px solid #0D6FD8;">
        <p style="margin: 0; color: #1e40af; font-size: 20px; font-weight: 700;">${profileViews.count}</p>
        <p style="margin: 4px 0 0; color: #374151; font-size: 14px;">
          ${isAr ? `مسؤولو توظيف شاهدوا ملفك خلال الـ 24 ساعة الماضية` : `recruiters viewed your profile in the last 24 hours`}
        </p>
        ${profileViews.viewers
          .slice(0, 3)
          .map((v) => `<p style="margin: 2px 0 0; color: #6b7280; font-size: 13px;">• ${esc(v.name)} (${v.role})</p>`)
          .join("")}
        ${profileViews.count > 3 ? `<p style="margin: 4px 0 0; color: #6b7280; font-size: 13px;">+ ${profileViews.count - 3} ${isAr ? "آخرين" : "more"}</p>` : ""}
      </div>
    </div>`
      : "";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: ${dir};">
      <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
        <p style="color: #bfdbfe; margin: 8px 0 0; font-size: 14px;">
          ${isAr ? "ملخصك اليومي" : "Your Daily Digest"}
        </p>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #374151; line-height: 1.6;">${greeting},</p>

        ${
          jobs.length > 0
            ? `
        <h3 style="color: #111827; font-size: 16px; margin: 20px 0 12px;">🎯 ${jobsTitle}</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${jobCards}
        </table>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${baseUrl}/${locale}/job-seeker/jobs" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
            ${isAr ? "عرض جميع الوظائف" : "View All Jobs"}
          </a>
        </div>`
            : ""
        }

        ${viewsSection}
      </div>
      <div style="padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; background: #f9fafb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
          ${isAr ? "تتلقى هذا البريد بناءً على إعداداتك." : "You're receiving this based on your notification settings."}
          <a href="${baseUrl}/${locale}/job-seeker/settings/notifications" style="color: #6b7280;">${isAr ? "إدارة التفضيلات" : "Manage preferences"}</a> |
          <a href="${baseUrl}/api/unsubscribe?ref=digest" style="color: #6b7280;">${isAr ? "إلغاء الاشتراك" : "Unsubscribe"}</a>
        </p>
      </div>
    </div>
  `;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
