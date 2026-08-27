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
import { formatCount } from "@/lib/ui/intlFormat";

export const dailyDigestWorker = inngest.createFunction(
  {
    id: "daily-digest-worker",
    name: "Daily Digest Email Worker",
    retries: 3,
    // Inngest free plan caps concurrency at 5 (sync is rejected above that).
    concurrency: { limit: 5 },
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

function companyInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const LOGO_COLORS = ["#3b82f6", "#059669", "#8b5cf6", "#d97706", "#e11d48", "#0891b2"];

function logoColor(name: string): string {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return LOGO_COLORS[hash % LOGO_COLORS.length];
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

  // Bayt-style job cards with company logos
  const jobCards = jobs
    .map((j) => {
      const salaryText =
        j.salary && j.salary.max > 0
          ? `${formatCount(j.salary.min)}–${formatCount(j.salary.max)} AED`
          : "";
      const matchColor =
        j.matchScore >= 80
          ? "#059669"
          : j.matchScore >= 60
            ? "#0D6FD8"
            : "#d97706";
      const bgColor = logoColor(j.company);
      const initials = companyInitials(j.company);

      return `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="width: 48px; vertical-align: top;">
                <div style="width: 44px; height: 44px; border-radius: 10px; background: ${bgColor}; color: white; font-size: 14px; font-weight: 700; text-align: center; line-height: 44px;">
                  ${initials}
                </div>
              </td>
              <td style="padding-${isAr ? "right" : "left"}: 12px; vertical-align: top;">
                <a href="${baseUrl}/${locale}/job-seeker/jobs/${j.jobId}" style="color: #0D6FD8; text-decoration: none; font-weight: 600; font-size: 15px;">${esc(j.title)}</a>
                <p style="margin: 2px 0 0; color: #374151; font-size: 13px; font-weight: 500;">${esc(j.company)}</p>
                <p style="margin: 2px 0 0; color: #6b7280; font-size: 12px;">📍 ${esc(j.location || "Remote")}${salaryText ? ` · 💰 ${salaryText}` : ""}</p>
              </td>
              <td style="text-align: ${isAr ? "left" : "right"}; vertical-align: top; width: 80px;">
                <span style="background: ${matchColor}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; display: inline-block;">${j.matchScore}% ${isAr ? "تطابق" : "match"}</span>
              </td>
            </tr>
          </table>
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
      <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0a2a6e 100%); padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px; letter-spacing: 1px;">MPLOYEDIN</h1>
        <p style="color: #bfdbfe; margin: 8px 0 0; font-size: 14px;">
          ${isAr ? "ملخصك اليومي" : "Your Daily Digest"}
        </p>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #374151; line-height: 1.6;">${greeting},</p>
        <p style="color: #6b7280; font-size: 14px;">
          ${isAr
            ? `وجدنا لك ${jobs.length} وظائف مطابقة بناءً على ملفك الشخصي 👀`
            : `We found some great job matches based on your profile 👀:`
          }
        </p>

        ${
          jobs.length > 0
            ? `
        <h3 style="color: #111827; font-size: 16px; margin: 20px 0 12px;">🎯 ${jobsTitle}</h3>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            ${jobCards}
          </table>
        </div>
        <div style="text-align: center; margin: 24px 0;">
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
